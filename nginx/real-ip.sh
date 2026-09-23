#!/bin/sh
# Entrypoint step (/docker-entrypoint.d): trust X-Forwarded-For from the reverse
# proxies listed in REAL_IP_FROM (comma-separated addresses or CIDRs), so
# $remote_addr, and with it the X-Real-IP the backend keys its rate limits and
# audit on, is the client rather than the proxy. Unset: nothing is trusted, and
# a client's own X-Forwarded-For never becomes its address.
set -eu

conf=/etc/nginx/conf.d/real-ip.conf
rm -f "$conf"
[ -n "${REAL_IP_FROM:-}" ] || exit 0

out=""
for entry in $(printf '%s' "$REAL_IP_FROM" | tr ',' ' '); do
	# Addresses only: anything else would be pasted into nginx's config.
	case "$entry" in
	*[!0-9A-Fa-f:./]* | "")
		echo "$0: REAL_IP_FROM entry '$entry' is not an address or CIDR" >&2
		exit 1
		;;
	esac
	out="${out}set_real_ip_from ${entry};
"
done
printf '%sreal_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n' "$out" >"$conf"
echo "$0: trusting X-Forwarded-For from ${REAL_IP_FROM}"
