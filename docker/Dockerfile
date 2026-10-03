# Paper 26.1+ needs Java 25; the temurin image is the least surprising choice.
FROM eclipse-temurin:25-jre

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates zip unzip \
 && rm -rf /var/lib/apt/lists/*

# Never run the server as root.
RUN useradd --system --create-home --home-dir /home/minecraft \
            --shell /usr/sbin/nologin minecraft

WORKDIR /srv/minecraft
COPY --chown=minecraft:minecraft . /srv/minecraft
RUN chmod +x /srv/minecraft/mc /srv/minecraft/docker/entrypoint.sh

USER minecraft

ENV MC_SERVER_DIR=/srv/minecraft/server \
    MC_BACKUP_DIR=/srv/minecraft/backups

# 25565/tcp for Java clients, 19132/udp for Bedrock clients via Geyser.
EXPOSE 25565/tcp 19132/udp

ENTRYPOINT ["/srv/minecraft/docker/entrypoint.sh"]