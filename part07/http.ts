import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpStateless } from "./handler.js";
import { REPO } from "./server.js";

// #region serve
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3333);

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: process.env.ALLOWED_HOSTS?.split(","),
});

app.post("/mcp", mcpStateless);
app.get("/mcp", (_req, res) => res.status(405).json({ error: "Method not allowed" }));

app.listen(PORT, HOST, () =>
  console.error(`repopilot (http) on http://${HOST}:${PORT}/mcp, repo: ${REPO}`),
);
// #endregion
