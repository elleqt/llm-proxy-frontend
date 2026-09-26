#!/usr/bin/env bash
# Runs the Playwright end-to-end tests against the real stack: builds and starts
# the backend's docker-compose stack (Postgres, backend, this frontend) from
# source, waits until every service is healthy, runs the tests, and always tears
# the stack down again: containers, volumes and the images it built.
#
# The stack is the backend's docker-compose.yml (published images) with its
# docker-compose.build.yml (source builds) on top, plus a throwaway override
# that builds the frontend from this checkout, gives both images names of this
# run's own and replaces the compose file's placeholder database password and
# credentials key with random ones (the backend refuses to start on the
# placeholder key). Everything else, the bootstrap administrator's email included, is
# the compose file's own value. Published images are never pulled: the run tests
# this working tree and the backend checkout beside it.
#
# Prerequisites:
#   - Docker with the compose plugin (v2), and ports 8080 and 8081 free: the
#     compose file publishes the proxied API and the frontend there.
#   - A backend checkout beside this repository. Override with BACKEND_DIR.
#   - `npm ci` done here, and a browser for Playwright: `npx playwright install
#     chromium`, or E2E_CHROMIUM_PATH pointing at a Chrome/Chromium binary.
#
# Optional: E2E_COMPOSE_PROJECT (default llmproxy-e2e). Arguments are passed to
# `playwright test`. The stack starts empty; the tests need no vendor account.
set -euo pipefail
cd "$(dirname "$0")/.."
frontend="$(pwd)"

backend="$(cd "${BACKEND_DIR:-../backend}" && pwd)"
for f in docker-compose.yml docker-compose.build.yml; do
	if [ ! -f "$backend/$f" ]; then
		echo "e2e-stack: $backend/$f not found; set BACKEND_DIR to the backend checkout" >&2
		exit 1
	fi
done

export E2E_COMPOSE_PROJECT="${E2E_COMPOSE_PROJECT:-llmproxy-e2e}"
backend_image="$E2E_COMPOSE_PROJECT-backend:e2e"
frontend_image="$E2E_COMPOSE_PROJECT-frontend:e2e"

# A throwaway database password and credentials key for a stack that lives only
# for this run. The key seals vendor credentials in the database; the stack starts
# with none, and the backend refuses the compose file's placeholder.
workdir="$(mktemp -d)"
db_password="$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')"
credentials_key="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
override="$workdir/docker-compose.e2e.yml"
cat >"$override" <<EOF
services:
  postgres:
    environment:
      POSTGRES_PASSWORD: "$db_password"
  backend:
    image: $backend_image
    build: {context: "$backend"}
    pull_policy: build
    environment:
      PGPASSWORD: "$db_password"
      LLMPROXY_CREDENTIALS_KEY: "$credentials_key"
  frontend:
    image: $frontend_image
    build: {context: "$frontend"}
    pull_policy: build
EOF

# Colon-separated, like COMPOSE_FILE; e2e/stack.ts reads the backend log with it.
export E2E_COMPOSE_FILES="$backend/docker-compose.yml:$backend/docker-compose.build.yml:$override"
export E2E_ADMIN_EMAIL=admin@example.com
export E2E_BASE_URL=http://localhost:8081
export E2E_API_URL=http://localhost:8080
compose=(docker compose -p "$E2E_COMPOSE_PROJECT"
	-f "$backend/docker-compose.yml" -f "$backend/docker-compose.build.yml" -f "$override")

teardown() {
	status=$?
	if [ "$status" -ne 0 ]; then
		"${compose[@]}" ps -a || true
		# The backend log holds the bootstrap password: never print it.
		"${compose[@]}" logs --no-color --tail 50 backend frontend 2>&1 |
			sed -E 's/(temporary password:).*/\1 <hidden>/' || true
	fi
	"${compose[@]}" down -v --remove-orphans || true
	docker image rm "$backend_image" "$frontend_image" >/dev/null 2>&1 || true
	rm -rf "$workdir"
	exit "$status"
}
trap teardown EXIT

"${compose[@]}" up --build --detach --wait --wait-timeout 300
npx playwright test "$@"
