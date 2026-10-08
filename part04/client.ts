// A tiny AI client: Claude decides, your code carries the messages. Run:  npx tsx part04/client.ts "what changed this week?"
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInterface } from "node:readline/promises";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
const mcp = new Client({ name: "repopilot-cli", version: "0.1.0" });
await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", process.env.SERVER ?? "part04/server.ts"],
    env: {
      ...process.env,
      REPOPILOT_REPO: process.env.REPOPILOT_REPO ?? "demo-repo",
    } as Record<string, string>,
  }),
);
const { tools } = await mcp.listTools();
const claude = new Anthropic();

// #region bridge
// MCP tool definition -> Claude tool definition: same three fields, different names
const claudeTools: Anthropic.Tool[] = tools.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
}));
// #endregion

// #region approve
const rl = createInterface({
  input: process.stdin,
  output: process.stderr,
});

async function allowed(name: string, args: unknown): Promise<boolean> {
  const tool = tools.find((t) => t.name === name);
  if (tool?.annotations?.readOnlyHint) return true; // safe reads run without asking
  const answer = await rl.question(`Run ${name}(${JSON.stringify(args)})? [y/N] `);
  return answer.trim().toLowerCase() === "y";
}
// #endregion

// #region loop
async function ask(question: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  while (true) {
    const res = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: claudeTools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      if (!(await allowed(block.name, block.input))) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "The user declined this action.",
        });
        continue;
      }
      const out = await mcp.callTool({
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
      const blocks = out.content as { type: string; text?: string }[];
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        is_error: Boolean(out.isError),
        content: blocks
          .filter((c) => c.type === "text")
          .map((c) => ({ type: "text" as const, text: c.text ?? "" })),
      });
    }
    messages.push({ role: "user", content: results });
  }
}
// #endregion

console.log(await ask(process.argv[2] ?? "What changed in this repo this week?"));
rl.close();
await mcp.close();
