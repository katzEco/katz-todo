# ponytail: multi-stage build using bun compile to standalone linux binary
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM debian:bookworm-slim AS runner
WORKDIR /app

COPY --from=builder /app/dist/katz-todo-linux-* /usr/local/bin/katz-todo
COPY --from=builder /app/public /app/public

ENV PORT=3000
EXPOSE 3000

CMD ["katz-todo"]
