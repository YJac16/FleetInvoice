#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/local-db/bootstrap-native.sh"
node "$ROOT/tests/rls/compliance-pr36.test.mjs"
