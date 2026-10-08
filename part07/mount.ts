// Already have an Express app? Add MCP as one more route.
import express from "express";
import { mcpStateless } from "./handler.js";

// #region mount
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true })); // your existing routes
app.post("/mcp", mcpStateless); // the MCP endpoint

app.listen(3333, "127.0.0.1");
// #endregion
