// Read resources from a client. Run:  npx tsx part05/read.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcp = new Client({ name: "repopilot-cli", version: "0.1.0" });
await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "part05/server.ts"],
    env: { ...process.env, REPOPILOT_REPO: "demo-repo" } as Record<string, string>,
  }),
);

// #region read
const { resources } = await mcp.listResources(); // direct ones, plus whatever the template lists
const { resourceTemplates } = await mcp.listResourceTemplates(); // the templates themselves
console.log(
  resources.map((r) => r.uri),
  resourceTemplates.map((t) => t.uriTemplate),
);

const res = await mcp.readResource({ uri: "repo://structure" });
const item = res.contents[0];
const files =
  "text" in item && item.mimeType === "application/json" ? JSON.parse(item.text) : [];
console.log(files);
// #endregion

const file = (await mcp.readResource({ uri: "repo://file/src/shipping.js" })).contents[0];
console.log("text" in file ? file.text : "(binary)");
await mcp.close();
