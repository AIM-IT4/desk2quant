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

# Create/update the dedicated API identity used by the Desk2Quant ChatGPT MCP.
# Full MCP mode: list/subscriber/campaign management + sending + transactional mail.
# Intentionally excludes subscribers:sql_query, users:manage, roles:manage,
# settings:manage, settings:maintain, media:manage, and destructive admin powers.
if [ -n "${LISTMONK_MCP_API_TOKEN:-}" ]; then
  TOKEN_HASH="$(printf '%s' "${LISTMONK_MCP_API_TOKEN}" | sha256sum | awk '{print $1}')"

  PGPASSWORD="${POSTGRES_PASSWORD}" psql     -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"     -v ON_ERROR_STOP=1     -c "INSERT INTO roles (type, permissions, name)
        VALUES (
          'user',
          ARRAY[
            'lists:get_all','lists:manage_all',
            'subscribers:get','subscribers:get_all','subscribers:manage',
            'campaigns:get','campaigns:get_all','campaigns:get_analytics',
            'campaigns:manage_all','campaigns:send',
            'tx:send',
            'bounces:get',
            'templates:get',
            'settings:get'
          ]::text[],
          'Desk2Quant MCP Full'
        )
        ON CONFLICT DO NOTHING;

        UPDATE roles
        SET permissions = ARRAY[
          'lists:get_all','lists:manage_all',
          'subscribers:get','subscribers:get_all','subscribers:manage',
          'campaigns:get','campaigns:get_all','campaigns:get_analytics',
          'campaigns:manage_all','campaigns:send',
          'tx:send',
          'bounces:get',
          'templates:get',
          'settings:get'
        ]::text[],
        updated_at = NOW()
        WHERE type = 'user' AND name = 'Desk2Quant MCP Full';

        INSERT INTO users (
          username, password_login, password, email, name, type,
          user_role_id, list_role_id, status
        )
        VALUES (
          'desk2quant-mcp', false, '${TOKEN_HASH}',
          'desk2quant-mcp@api', 'Desk2Quant MCP', 'api',
          (SELECT id FROM roles
             WHERE type = 'user' AND name = 'Desk2Quant MCP Full'
             ORDER BY id LIMIT 1),
          NULL, 'enabled'
        )
        ON CONFLICT (username)
        DO UPDATE SET
          password = EXCLUDED.password,
          user_role_id = EXCLUDED.user_role_id,
          status = 'enabled',
          updated_at = NOW();"     >/dev/null
fi

exec listmonk --config ''
