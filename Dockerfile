FROM oven/bun:1-alpine
RUN apk add --no-cache python3 make g++
COPY . /app
WORKDIR /app
RUN bun install --frozen-lockfile && bun run build
CMD ["bun", "run", "serve"]