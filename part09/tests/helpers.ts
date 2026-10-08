import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// #region fixture
// A throwaway git repo, so tests never depend on your real projects
export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "repopilot-test-"));
  const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Tester");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.js"), "// TODO: first\nexport const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  writeFileSync(join(dir, "src", "a.js"), "// TODO: first\nexport const a = 2;\n");
  git("commit", "-qam", "second");
  return dir;
}

// An in-memory client and server pair: the real protocol, no processes
export async function connect(repo: string): Promise<Client> {
  process.env.REPOPILOT_REPO = repo;
  process.env.REPOPILOT_AUDIT = join(repo, "audit.log");
  const { buildServer } = await import("../server.js");
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.1" });
  await Promise.all([buildServer().connect(serverSide), client.connect(clientSide)]);
  return client;
}
// #endregion
