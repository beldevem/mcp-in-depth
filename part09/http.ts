import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpPost, mcpSession } from "./handler.js";
import { REPO } from "./server.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3333);

// #region auth
const TOKEN = process.env.REPOPILOT_TOKEN;
const LOCAL = ["127.0.0.1", "localhost", "::1"];

if (!TOKEN && !LOCAL.includes(HOST)) {
  console.error("Refusing to listen on a network address without REPOPILOT_TOKEN.");
  process.exit(1);
}

function bearer(req: Request, res: Response, next: NextFunction) {
  if (!TOKEN) return next(); // local-only dev mode
  const got = Buffer.from((req.header("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(TOKEN);
  if (got.length === want.length && timingSafeEqual(got, want)) return next();
  res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "Unauthorized" });
}
// #endregion

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: process.env.ALLOWED_HOSTS?.split(","),
});
app.use("/mcp", bearer);
app.post("/mcp", mcpPost);
app.get("/mcp", mcpSession); // server-to-client stream
app.delete("/mcp", mcpSession); // end the session

app.listen(PORT, HOST, () =>
  console.error(
    `repopilot (http, auth ${TOKEN ? "on" : "off"}) on http://${HOST}:${PORT}/mcp, repo: ${REPO}`,
  ),
);
