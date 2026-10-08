// No AI needed: be a client. Run:  npx tsx part04/call.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// #region connect
const mcp = new Client({ name: "repopilot-cli", version: "0.1.0" });

await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "part04/server.ts"],
    env: { ...process.env, REPOPILOT_REPO: "demo-repo" } as Record<string, string>,
  }),
);
// #endregion

// #region call
const { tools } = await mcp.listTools();
console.log(tools.map((t) => t.name));

const result = await mcp.callTool({
  name: "git_log",
  arguments: { limit: 3 },
});
console.log(result.isError ? "tool failed" : result.content);
// #endregion

await mcp.close();
