#!/usr/bin/env bash
# Minimal Supabase-compatible API (GoTrue + PostgREST) for local audit UI tests.
set -euo pipefail

JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
DB_URL="${DB_URL:-postgres://supabase_admin:postgres@127.0.0.1:54322/postgres}"
GOTRUE_PORT="${GOTRUE_PORT:-9999}"
REST_PORT="${REST_PORT:-3002}"
PROXY_PORT="${PROXY_PORT:-54321}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker required" >&2
  exit 1
fi

docker rm -f workops-gotrue workops-postgrest 2>/dev/null || true

docker run -d --name workops-gotrue --network host \
  -e GOTRUE_API_HOST=0.0.0.0 \
  -e GOTRUE_API_PORT="$GOTRUE_PORT" \
  -e API_EXTERNAL_URL="http://127.0.0.1:${PROXY_PORT}" \
  -e GOTRUE_SITE_URL="http://127.0.0.1:3000" \
  -e GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:3000/**,http://localhost:3000/**" \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
  -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="$DB_URL" \
  -e GOTRUE_DISABLE_SIGNUP=false \
  -e GOTRUE_MAILER_AUTOCONFIRM=true \
  public.ecr.aws/supabase/gotrue:v2.192.0 >/dev/null

docker run -d --name workops-postgrest --network host \
  -e PGRST_DB_URI="$DB_URL" \
  -e PGRST_DB_SCHEMAS=public,storage \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_SERVER_PORT="$REST_PORT" \
  public.ecr.aws/supabase/postgrest:v14.14 >/dev/null

echo "GoTrue :${GOTRUE_PORT}, PostgREST :${REST_PORT}. Proxy: REST_URL=http://127.0.0.1:${REST_PORT} node scripts/local-db/supabase-proxy.mjs"
