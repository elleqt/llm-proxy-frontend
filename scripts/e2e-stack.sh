#!/usr/bin/env bash
# Runs the Playwright end-to-end tests against the real stack: builds and starts
# the backend's docker-compose stack (Postgres, backend, this frontend), waits
# until every service is healthy, runs the tests, and always tears the stack
# down again: containers, volumes and the images it built.
#
# Prerequisites:
#   - Docker with the compose plugin (v2), and ports 8080 and 8081 free: the
#     compose file publishes the proxied API and the frontend there.
#   - A backend checkout beside this repository (its compose file builds
#     ../frontend, i.e. this working tree). Override with BACKEND_DIR.
#   - `npm ci` done here, and a browser for Playwright: `npx playwright install
#     chromium`, or E2E_CHROMIUM_PATH pointing at a Chrome/Chromium binary.
#
# Optional: E2E_COMPOSE_PROJECT (default llmproxy-e2e). Arguments are passed to
# `playwright test`. The stack starts empty; the tests need no vendor account.
set -euo pipefail
cd "$(dirname "$0")/.."

backend="$(cd "${BACKEND_DIR:-../backend}" && pwd)"
compose_file="$backend/docker-compose.yml"
if [ ! -f "$compose_file" ]; then
	echo "e2e-stack: $compose_file not found; set BACKEND_DIR to the backend checkout" >&2
	exit 1
fi

# Throwaway values for a stack that lives only for this run.
workdir="$(mktemp -d)"
env_file="$workdir/.env"
cat >"$env_file" <<EOF
POSTGRES_USER=llmproxy
POSTGRES_PASSWORD=$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')
POSTGRES_DB=llmproxy
LLMPROXY_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
EOF

export E2E_COMPOSE_PROJECT="${E2E_COMPOSE_PROJECT:-llmproxy-e2e}"
export E2E_COMPOSE_FILE="$compose_file"
export E2E_COMPOSE_ENV_FILE="$env_file"
export E2E_ADMIN_EMAIL=admin@example.com
export E2E_BASE_URL=http://localhost:8081
export E2E_API_URL=http://localhost:8080
compose=(docker compose -p "$E2E_COMPOSE_PROJECT" -f "$compose_file" --env-file "$env_file")

teardown() {
	status=$?
	if [ "$status" -ne 0 ]; then
		"${compose[@]}" ps -a || true
		# The backend log holds the bootstrap password: never print it.
		"${compose[@]}" logs --no-color --tail 50 backend frontend 2>&1 |
			sed -E 's/(temporary password:).*/\1 <hidden>/' || true
	fi
	"${compose[@]}" down -v --rmi local --remove-orphans || true
	rm -rf "$workdir"
	exit "$status"
}
trap teardown EXIT

"${compose[@]}" up --build --detach --wait --wait-timeout 300
npx playwright test "$@"
