// Connect to a remote server. Run the server first:  npx tsx part07/http.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// #region connect
const mcp = new Client({ name: "repopilot-cli", version: "0.1.0" });
await mcp.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3333/mcp")));

console.log((await mcp.listTools()).tools.map((t) => t.name));
// #endregion
await mcp.close();
