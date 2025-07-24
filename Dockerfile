FROM oven/bun:alpine AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock

# Install necessary packages for esbuild to work on Alpine
RUN apk add --no-cache curl

# Force Bun to skip verification
ENV ESBUILD_BINARY_PATH=/usr/local/bin/esbuild
RUN bun install --no-verify

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--target bun \
	--outfile server \
	./src/index.ts

FROM oven/bun:alpine

WORKDIR /app

# Install curl in the final image for healthcheck
RUN apk add --no-cache curl

COPY --from=build /app/server server

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["./server"]

EXPOSE 3000