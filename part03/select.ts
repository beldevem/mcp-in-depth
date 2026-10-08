// Does the model pick the right tool? A tiny selection eval. Needs ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// #region select
const CASES: [question: string, expected: string][] = [
  ["What happened in this repo this week?", "what_changed_since"],
  ["Where is the shipping function defined?", "search_code"],
  ["What did the last commit change?", "git_diff"],
  ["What is left to do in the code?", "list_todos"],
];

const mcp = new Client({ name: "select-eval", version: "0.1.0" });
await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "part03/server.ts"],
  }),
);
const { tools } = await mcp.listTools();
const claude = new Anthropic();

let hits = 0;
for (const [question, expected] of CASES) {
  const res = await claude.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 300,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema,
    })),
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: question }],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  const picked = call?.type === "tool_use" ? call.name : "none";
  if (picked === expected) hits++;
  console.log(picked === expected ? "ok  " : "MISS", question, "->", picked);
}
console.log(`${hits}/${CASES.length} correct`);
await mcp.close();
// #endregion
