#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

until pg_isready -h 127.0.0.1 -p 5432 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 1
done

export LISTMONK_db__user="${POSTGRES_USER}"
export LISTMONK_db__password="${POSTGRES_PASSWORD}"
export LISTMONK_db__database="${POSTGRES_DB}"

listmonk --install --idempotent --yes --config ''
listmonk --upgrade --yes --config ''

# Create/update a dedicated read-only API identity for the ChatGPT MCP.
# The plaintext token is kept only in Railway's environment; Listmonk stores
# its SHA-256 digest, matching Listmonk's native API-token implementation.
if [ -n "${LISTMONK_MCP_API_TOKEN:-}" ]; then
  TOKEN_HASH="$(printf '%s' "${LISTMONK_MCP_API_TOKEN}" | sha256sum | awk '{print $1}')"

  ROLE_ID="$(
    PGPASSWORD="${POSTGRES_PASSWORD}" psql       -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -At       -c "INSERT INTO roles (type, permissions, name)
          VALUES (
            'user',
            ARRAY[
              'lists:get_all','list:get',
              'subscribers:get','subscribers:get_all',
              'campaigns:get','campaigns:get_all','campaigns:get_analytics',
              'bounces:get','templates:get','settings:get'
            ]::text[],
            'Desk2Quant MCP Read Only'
          )
          ON CONFLICT (type, name) WHERE name IS NOT NULL
          DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()
          RETURNING id;"
  )"

  PGPASSWORD="${POSTGRES_PASSWORD}" psql     -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"     -v ON_ERROR_STOP=1     -c "INSERT INTO users (
          username, password_login, password, email, name, type,
          user_role_id, list_role_id, status
        )
        VALUES (
          'desk2quant-mcp', false, '${TOKEN_HASH}',
          'desk2quant-mcp@api', 'Desk2Quant MCP', 'api',
          ${ROLE_ID}, NULL, 'enabled'
        )
        ON CONFLICT (username)
        DO UPDATE SET
          password = EXCLUDED.password,
          user_role_id = EXCLUDED.user_role_id,
          status = 'enabled',
          updated_at = NOW();"
fi

exec listmonk --config ''
