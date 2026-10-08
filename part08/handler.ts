import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";

// #region sessions
// Asking the user a question needs a session: the answer comes back as a separate request.
const transports = new Map<string, StreamableHTTPServerTransport>();

export async function mcpPost(req: Request, res: Response) {
  const id = req.header("mcp-session-id");
  let transport = id ? transports.get(id) : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    const created: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (sid) => void transports.set(sid, created),
    });
    created.onclose = () => created.sessionId && transports.delete(created.sessionId);
    await buildServer().connect(created);
    transport = created;
  }
  if (!transport)
    return void res.status(400).json({ error: "No valid session. Send initialize first." });
  await transport.handleRequest(req, res, req.body);
}

export async function mcpSession(req: Request, res: Response) {
  const transport = transports.get(String(req.header("mcp-session-id")));
  if (!transport) return void res.status(400).send("Unknown session");
  await transport.handleRequest(req, res);
}
// #endregion
