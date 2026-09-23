#!/usr/bin/env bash
# Checks the running image's header contract: CSP with the pre-paint hash and
# no inline allowance, the security headers, and the cache policy per path.
# Used by CI; runs against any served image:  nginx/check-headers.sh http://127.0.0.1:8080
set -euo pipefail

base="${1:?usage: check-headers.sh <base URL>}"
failed=0

# headers <path>: status line and headers, lower-cased names.
headers() { curl -sS -o /dev/null -D - "$base$1" | tr -d '\r'; }
has() { # has <path> <headers> <regex> <what>
	if ! grep -Eiq "$3" <<<"$2"; then
		echo "FAIL $1: $4" >&2
		failed=1
	fi
}
lacks() { # lacks <path> <headers> <regex> <what>
	if grep -Eiq "$3" <<<"$2"; then
		echo "FAIL $1: $4" >&2
		failed=1
	fi
}
security() { # every response, errors included
	has "$1" "$2" "^content-security-policy: .*script-src 'self' 'sha256-[A-Za-z0-9+/]+=*'" "CSP without the pre-paint hash"
	has "$1" "$2" "^content-security-policy: .*style-src 'self';" "CSP style-src is not 'self' only"
	has "$1" "$2" "^content-security-policy: .*frame-ancestors 'none'" "CSP without frame-ancestors 'none'"
	lacks "$1" "$2" "^content-security-policy: .*unsafe-" "CSP allows something unsafe"
	has "$1" "$2" "^x-content-type-options: nosniff$" "no X-Content-Type-Options: nosniff"
	has "$1" "$2" "^referrer-policy: strict-origin-when-cross-origin$" "wrong or missing Referrer-Policy"
	lacks "$1" "$2" "^server: nginx/" "server version exposed"
}

for path in / /admin/users; do
	h="$(headers "$path")"
	has "$path" "$h" "^HTTP/[0-9.]+ 200" "not 200"
	has "$path" "$h" "^content-type: text/html" "not the application's HTML"
	has "$path" "$h" "^cache-control: no-cache$" "HTML not revalidated (Cache-Control: no-cache)"
	security "$path" "$h"
done

asset="$(curl -sS "$base/" | grep -Eo '/assets/[^"]+\.js' | head -n 1)"
if [ -z "$asset" ]; then
	echo "FAIL /: no hashed script in index.html" >&2
	failed=1
else
	h="$(headers "$asset")"
	has "$asset" "$h" "^HTTP/[0-9.]+ 200" "not 200"
	has "$asset" "$h" "^cache-control: public, max-age=31536000, immutable$" "hashed asset not cached as immutable"
	security "$asset" "$h"
fi

missing=/assets/does-not-exist.js
h="$(headers "$missing")"
has "$missing" "$h" "^HTTP/[0-9.]+ 404" "a missing asset is not 404"
lacks "$missing" "$h" "immutable" "a 404 is cached as immutable"
security "$missing" "$h"

[ "$(curl -sS "$base/healthz")" = ok ] || {
	echo "FAIL /healthz: not ok" >&2
	failed=1
}

[ "$failed" -eq 0 ] && echo "check-headers: all checks passed for $base"
exit "$failed"
