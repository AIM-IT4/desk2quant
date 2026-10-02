FROM listmonk/listmonk:v6.2.0

EXPOSE 9000

CMD ["sh","-c","./listmonk --install --idempotent --yes --config '' && ./listmonk --upgrade --yes --config '' && exec ./listmonk --config ''"]
