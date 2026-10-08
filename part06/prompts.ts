// Use prompts and watch progress from a client. Run:  npx tsx part06/prompts.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcp = new Client({ name: "repopilot-cli", version: "0.1.0" });
await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "part06/server.ts"],
    env: { ...process.env, REPOPILOT_REPO: "demo-repo" } as Record<string, string>,
  }),
);

// #region getprompt
const { prompts } = await mcp.listPrompts();
for (const p of prompts)
  console.log(
    p.name,
    p.arguments?.map((a) => a.name),
  );

const prompt = await mcp.getPrompt({
  name: "code_review",
  arguments: { ref: "HEAD~1" },
});
const messages = prompt.messages.map((m) => ({
  role: m.role,
  content: m.content.type === "text" ? m.content.text : "",
}));
// `messages` is ready to send to Claude as the start of the conversation
console.log(messages[0].content);
// #endregion

// #region onprogress
const result = await mcp.callTool({ name: "run_tests", arguments: {} }, undefined, {
  onprogress: (p) => console.log(`progress ${p.progress}: ${p.message}`),
});
console.log(result.content);
// #endregion

await mcp.close();
