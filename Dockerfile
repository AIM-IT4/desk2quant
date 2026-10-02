FROM listmonk/listmonk:v6.2.0 AS listmonk

FROM postgres:18-alpine

RUN apk add --no-cache supervisor ca-certificates tzdata

COPY --from=listmonk /listmonk/listmonk /usr/local/bin/listmonk
COPY start-listmonk.sh /usr/local/bin/start-listmonk.sh
COPY start-postgres.sh /usr/local/bin/start-postgres.sh
COPY supervisord.conf /etc/supervisord.conf

RUN chmod +x /usr/local/bin/listmonk /usr/local/bin/start-listmonk.sh /usr/local/bin/start-postgres.sh

ENV LISTMONK_app__address=0.0.0.0:9000 \
    LISTMONK_db__host=127.0.0.1 \
    LISTMONK_db__port=5432 \
    LISTMONK_db__ssl_mode=disable \
    LISTMONK_db__max_open=10 \
    LISTMONK_db__max_idle=5 \
    LISTMONK_db__max_lifetime=300s \
    TZ=Etc/UTC

EXPOSE 9000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
