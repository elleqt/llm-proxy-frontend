# syntax=docker/dockerfile:1

# The static build is the same for every target platform, so it runs once on the
# builder's native platform; only the nginx stage below is per target.
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Version shown in the UI footer; CI passes the tag / edge-<sha>. "dev" for local builds.
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build \
 && node nginx/csp-hash.mjs dist/index.html nginx/default.conf.template /tmp/default.conf.template

# The alpine variant is required: the compose healthcheck calls BusyBox wget.
FROM nginx:1.31-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
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
