# Build from handson/mcp:  docker build -t repopilot .
# Run:  docker run --rm -p 3333:3333 -v "$PWD/demo-repo:/repo:ro" repopilot
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY part07 ./part07
ENV HOST=0.0.0.0 PORT=3333 REPOPILOT_REPO=/repo ALLOWED_HOSTS=localhost,127.0.0.1
EXPOSE 3333
CMD ["npx", "tsx", "part07/http.ts"]
