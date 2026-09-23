# syntax=docker/dockerfile:1

FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
 && node nginx/csp-hash.mjs dist/index.html nginx/default.conf.template /tmp/default.conf.template

# The alpine variant is required: the compose healthcheck calls BusyBox wget.
FROM nginx:1.30-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b
# Unprivileged: no `user` switch, pid file in /tmp, and the paths nginx and the
# entrypoint's template step write to owned by the nginx user.
RUN sed -i -e '/^user /d' -e 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && rm /etc/nginx/conf.d/default.conf \
 && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d
COPY --from=build /tmp/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
COPY --chmod=755 nginx/real-ip.sh /docker-entrypoint.d/40-real-ip.sh

# BACKEND_ORIGIN: scheme://host[:port] of the backend's web listener, no path.
# REAL_IP_FROM (unset by default): comma-separated addresses/CIDRs of the
# reverse proxies in front of this container, trusted for X-Forwarded-For.
# The application is served at the site root; the base path is fixed at "/"
# (mount it on its own host name, or behind a proxy that strips a prefix).
ENV BACKEND_ORIGIN=http://backend:8081 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER=^(BACKEND_ORIGIN|NGINX_LOCAL_RESOLVERS)$

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
