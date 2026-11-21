# Servidor ToFalany (RF-33). Contexto do build: a raiz do repositório (o servidor usa o pacote shared).
# Imagens multi-arquitetura (amd64 e arm64): roda no PC, numa VPS ou numa Oracle ARM.

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Ferramentas para compilar nativos sem binário pronto para esta versão do Node/arquitetura (só neste estágio).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# O npm precisa de todos os package.json do monorepo para seguir o package-lock (o app desktop não é instalado).
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --workspace shared --workspace server --include-workspace-root
COPY shared shared
COPY server server
RUN npm run build -w shared && npm run build -w server \
  && npm prune --omit=dev --workspace shared --workspace server --include-workspace-root \
  && mkdir -p server/node_modules shared/node_modules

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORTA=3000 HOST=0.0.0.0 BANCO=/data/tofalando.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/node_modules shared/node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/node_modules server/node_modules
# Banco, backups, arquivos enviados e instaladores oferecidos no convite ficam no volume /data.
RUN mkdir -p /data && chown node:node /data
# Backlog v2, item 14: bot de música. ffmpeg converte o áudio; o yt-dlp (binário oficial, sem Python) busca no
# YouTube e usa o Node da imagem como runtime de JavaScript. Fica do usuário node: o servidor o atualiza sozinho
# (yt-dlp -U) ao ligar e uma vez por dia, porque o YouTube muda e quebra versões antigas.
# infra-e-atualizacao (T-11, T-13): o que entra na imagem tem versão e SHA-256 fixos (um por arquitetura), tirados
# do SHA2-256SUMS da release do yt-dlp e do digest do zip do plugin no GitHub. Trocar a versão = trocar os hashes.
ARG YTDLP_VERSAO=2026.10.26
ARG YTDLP_SHA256_AMD64=767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795
ARG YTDLP_SHA256_ARM64=e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483
# Plugin do gerador de token de origem (mesma versão do contêiner bgutil no docker-compose.vps.yml).
ARG BGUTIL_VERSAO=2.0.2
ARG BGUTIL_SHA256=a26b980bf6d8e8400d8f21445daa4d8381bf6183d20f0be309391f86b31e27ef
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && case "$(dpkg --print-architecture)" in \
       arm64) arquivo=yt-dlp_linux_aarch64 soma="$YTDLP_SHA256_ARM64" ;; \
       amd64) arquivo=yt-dlp_linux soma="$YTDLP_SHA256_AMD64" ;; \
       *) echo "Arquitetura sem yt-dlp conferido: $(dpkg --print-architecture)" >&2; exit 1 ;; \
     esac \
  && mkdir -p /opt/yt-dlp \
  && curl -fsSL -o /opt/yt-dlp/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSAO}/${arquivo}" \
  && echo "${soma}  /opt/yt-dlp/yt-dlp" | sha256sum -c - \
  && chmod 755 /opt/yt-dlp/yt-dlp && chown -R node:node /opt/yt-dlp \
  && mkdir -p /etc/yt-dlp/plugins \
  && curl -fsSL -o /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip \
       "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSAO}/bgutil-ytdlp-pot-provider.zip" \
  && echo "${BGUTIL_SHA256}  /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip" | sha256sum -c - \
  && chmod 644 /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip
ENV MUSICA_YTDLP=/opt/yt-dlp/yt-dlp MUSICA_YTDLP_ARGS="--js-runtimes node"
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/dist/index.js"]
