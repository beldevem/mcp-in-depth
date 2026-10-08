// quick manual probe: npx tsx probe.ts partNN/server.ts tool '{"json":"args"}'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const [file, tool, args] = process.argv.slice(2);
const client = new Client({ name: "probe", version: "0.0.1" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", file],
    env: {
      ...process.env,
      REPOPILOT_REPO: process.env.REPOPILOT_REPO ?? "demo-repo",
    } as Record<string, string>,
  }),
);
if (!tool) console.log(JSON.stringify((await client.listTools()).tools.map((t) => t.name)));
else
  console.log(
    JSON.stringify(
      await client.callTool({
        name: tool,
        arguments: args ? JSON.parse(args) : {},
      }),
      null,
      1,
    ),
  );
await client.close();
