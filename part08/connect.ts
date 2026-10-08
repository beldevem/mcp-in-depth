// Connect to the protected server and answer its confirmation questions.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// #region client
const mcp = new Client(
  { name: "repopilot-cli", version: "0.1.0" },
  { capabilities: { elicitation: {} } },
);

// The server asks, the CLIENT shows it to the human. Here we auto-answer for the demo.
mcp.setRequestHandler(ElicitRequestSchema, async (req) => {
  console.log("server asks:", req.params.message);
  return { action: "accept", content: { ok: process.env.ANSWER !== "no" } };
});

await mcp.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3333/mcp"), {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.REPOPILOT_TOKEN}` },
    },
  }),
);
// #endregion

console.log(
  (
    await mcp.callTool({
      name: "create_branch",
      arguments: { name: "demo/confirm" },
    })
  ).content,
);
await mcp.close();
