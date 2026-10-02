#!/bin/sh
set -eu

# Railway's managed postgres-ssl image may leave TLS files owned by a
# different UID on the persistent volume. PostgreSQL refuses to start unless
# the private key is owned by postgres or root and is not group/world readable.
if [ -d /var/lib/postgresql/data/certs ]; then
  chown -R postgres:postgres /var/lib/postgresql/data/certs || true
  if [ -f /var/lib/postgresql/data/certs/server.key ]; then
    chmod 600 /var/lib/postgresql/data/certs/server.key || true
  fi
fi

exec /usr/local/bin/docker-entrypoint.sh postgres
