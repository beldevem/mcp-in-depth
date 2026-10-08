import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const [file, uri] = process.argv.slice(2);
const c = new Client({ name: "p", version: "0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", file], env: { ...process.env, REPOPILOT_REPO: "demo-repo" } as Record<string,string> }));
try { console.log(JSON.stringify((await c.readResource({ uri })).contents[0]).slice(0,300)); } catch (e) { console.log("ERR", String(e).slice(0,200)); }
await c.close();
