// Replay three attacks against a stdio server. Usage: npx tsx attack.ts part07/stdio.ts   (vulnerable)
//                                                     npx tsx attack.ts part08/stdio.ts   (hardened)
import { existsSync, rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcp = new Client({ name: "attacker", version: "0.0.1" });
await mcp.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", process.argv[2]],
    env: { ...process.env, REPOPILOT_REPO: "demo-repo" } as Record<string, string>,
  }),
);
const show = (label: string, ok: boolean) =>
  console.log(ok ? "VULNERABLE" : "blocked   ", label);

// #region attacks
// 1. Path traversal through a resource URI
try {
  const r = await mcp.readResource({
    uri: "repo://file/..%2Fpackage.json",
  });
  show("read ../package.json outside the repo", "text" in r.contents[0]);
} catch {
  show("read ../package.json outside the repo", false);
}

// 2. Option injection: a "ref" that git reads as a flag
const target = "/tmp/repopilot-pwned.txt";
rmSync(target, { force: true });
await mcp
  .callTool({ name: "git_diff", arguments: { ref: `--output=${target}` } })
  .catch(() => {});
show("write a file with git_diff --output", existsSync(target));
rmSync(target, { force: true });
rmSync(`${target}~1`, { force: true });

// 3. An untracked secret file
try {
  const r = await mcp.readResource({ uri: "repo://file/.env" });
  show("read untracked .env", "text" in r.contents[0]);
} catch {
  show("read untracked .env", false);
}
// #endregion
await mcp.close();
