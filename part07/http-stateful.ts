import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";

// #region stateful
const transports = new Map<string, StreamableHTTPServerTransport>();
const app = createMcpExpressApp();

app.post("/mcp", async (req, res) => {
  const id = req.header("mcp-session-id");
  let transport = id ? transports.get(id) : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (sid) => void transports.set(sid, transport!),
    });
    transport.onclose = () => transport!.sessionId && transports.delete(transport!.sessionId);
    await buildServer().connect(transport);
  }
  if (!transport)
    return void res.status(400).json({ error: "No valid session. Send initialize first." });
  await transport.handleRequest(req, res, req.body);
});

// GET opens the server-to-client stream, DELETE ends the session
const bySession = async (req: any, res: any) => {
  const t = transports.get(String(req.header("mcp-session-id")));
  return t ? t.handleRequest(req, res) : res.status(400).send("Unknown session");
};
app.get("/mcp", bySession);
app.delete("/mcp", bySession);
// #endregion

app.listen(Number(process.env.PORT ?? 3333), "127.0.0.1");
