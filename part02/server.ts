import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const REPO = process.env.REPOPILOT_REPO ?? process.cwd();

// #region git
async function git(...args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", REPO, ...args], {
    timeout: 15_000,
    maxBuffer: 10_000_000,
  });
  return stdout.trim();
}

const text = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
});
// #endregion

const server = new McpServer({ name: "repopilot", version: "0.2.0" });

// #region tools
server.registerTool(
  "git_log",
  {
    description: "List recent commits: short sha, author, date and subject.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
  },
  async ({ limit }) =>
    text(await git("log", `-n${limit}`, "--date=short", "--pretty=format:%h  %ad  %an  %s")),
);

server.registerTool(
  "git_diff",
  {
    description: "Show the diff between a commit and its parent.",
    inputSchema: { ref: z.string().default("HEAD") },
  },
  async ({ ref }) => text(await git("diff", `${ref}~1`, ref)),
);
// #endregion

// #region search
server.registerTool(
  "search_code",
  {
    description: "Search tracked files for a text pattern. Returns file:line:text.",
    inputSchema: {
      pattern: z.string().describe("Text to look for"),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ pattern, limit }) => {
    try {
      const out = await git("grep", "-n", "-I", "-F", "-e", pattern);
      return text(out.split("\n").slice(0, limit).join("\n"));
    } catch {
      return text("No matches.");
    }
  },
);

server.registerTool(
  "list_todos",
  { description: "List every TODO and FIXME comment in the repo." },
  async () => {
    try {
      return text(await git("grep", "-n", "-I", "-E", "TODO|FIXME"));
    } catch {
      return text("No TODO or FIXME comments found.");
    }
  },
);
// #endregion

// #region async
async function openIssues(repo: string, limit: number) {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?per_page=${limit}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "repopilot" },
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${repo}`);
  const issues = (await res.json()) as {
    number: number;
    title: string;
    pull_request?: unknown;
  }[];
  return issues.filter((i) => !i.pull_request).map((i) => `#${i.number} ${i.title}`);
}
// #endregion

// #region asynctool
server.registerTool(
  "github_issues",
  {
    description: "List open GitHub issues for a public repo, e.g. owner/name.",
    inputSchema: {
      repo: z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/)
        .describe("owner/name"),
      limit: z.number().int().min(1).max(30).default(5),
    },
  },
  async ({ repo, limit }) => text((await openIssues(repo, limit)).join("\n")),
);
// #endregion

// #region run
console.error(`repopilot ready, repo: ${REPO}`); // stderr, never stdout
await server.connect(new StdioServerTransport());
// #endregion
