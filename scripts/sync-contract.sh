#!/usr/bin/env bash
# Vendor the API contract from a backend checkout next to this repository, then
# regenerate the types. Override the source with BACKEND_DIR.
set -euo pipefail
cd "$(dirname "$0")/.."

src="${BACKEND_DIR:-../backend}/api/openapi.yaml"
if [ ! -f "$src" ]; then
	echo "sync-contract: $src not found; set BACKEND_DIR to the backend checkout" >&2
	exit 1
fi

cp "$src" api/openapi.yaml
npm run --silent gen:api
echo "sync-contract: api/openapi.yaml and src/shared/api/schema.d.ts updated from $src"
