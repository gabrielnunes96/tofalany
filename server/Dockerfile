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
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/dist/index.js"]
