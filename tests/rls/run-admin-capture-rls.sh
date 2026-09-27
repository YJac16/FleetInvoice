#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null
node "$ROOT/tests/rls/admin-capture-entities.test.mjs"
