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
exec listmonk --config ''
