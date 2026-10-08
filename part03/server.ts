import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const REPO = process.env.REPOPILOT_REPO ?? process.cwd();

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

// #region errors
const fail = (message: string) => ({ ...text(message), isError: true });

function gitProblem(err: unknown, ref: string) {
  const msg = String((err as { stderr?: string }).stderr ?? err);
  if (/unknown revision|bad revision|ambiguous argument/i.test(msg)) {
    return fail(
      `'${ref}' is not a commit in this repo. Pass a branch, tag or sha such as HEAD~2. Use git_log to find one.`,
    );
  }
  return fail(`git failed: ${msg.split("\n")[0]}`);
}
// #endregion

const server = new McpServer({ name: "repopilot", version: "0.3.0" });

// #region hints
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

server.registerTool(
  "git_log",
  {
    title: "Recent commits",
    description:
      "List the most recent commits (short sha, date, author, subject). " +
      "Use this to find a commit to inspect. For a summary of a time window, use what_changed_since instead.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("How many commits, newest first"),
    },
    annotations: READ_ONLY,
  },
  async ({ limit }) =>
    text(await git("log", `-n${limit}`, "--date=short", "--pretty=format:%h  %ad  %an  %s")),
);
// #endregion

// #region results
server.registerTool(
  "what_changed_since",
  {
    title: "What changed",
    description:
      "Summarise activity in a time window: number of commits, who committed, and the most-changed files. " +
      "Use this for questions like 'what happened this week?'. Not for reading a specific diff (use git_diff).",
    inputSchema: {
      since: z
        .string()
        .default("7 days ago")
        .describe("A git date such as '3 days ago' or '2026-10-01'"),
    },
    outputSchema: {
      commits: z.number(),
      authors: z.array(z.string()),
      topFiles: z.array(
        z.object({
          path: z.string(),
          added: z.number(),
          deleted: z.number(),
        }),
      ),
    },
    annotations: READ_ONLY,
  },
  async ({ since }) => {
    const out = await git("log", `--since=${since}`, "--numstat", "--pretty=format:@%an");
    const authors = new Set<string>();
    const files = new Map<string, { added: number; deleted: number }>();
    let commits = 0;
    for (const line of out.split("\n")) {
      if (line.startsWith("@")) {
        commits++;
        authors.add(line.slice(1));
        continue;
      }
      const [a, d, path] = line.split("\t");
      if (!path) continue;
      const f = files.get(path) ?? { added: 0, deleted: 0 };
      f.added += Number(a) || 0;
      f.deleted += Number(d) || 0;
      files.set(path, f);
    }
    const topFiles = [...files]
      .map(([path, f]) => ({ path, ...f }))
      .sort((x, y) => y.added + y.deleted - (x.added + x.deleted))
      .slice(0, 10);
    const result = { commits, authors: [...authors], topFiles };
    return {
      content: [
        {
          type: "text",
          text: `${commits} commits by ${authors.size} author(s) since ${since}.`,
        },
      ],
      structuredContent: result,
    };
  },
);
// #endregion

// #region diff
const MAX_CHARS = 8_000;

server.registerTool(
  "git_diff",
  {
    title: "Show a commit's diff",
    description:
      "Show what one commit changed. Large diffs are truncated; pass `path` to focus on one file. " +
      "To find a commit first, use git_log.",
    inputSchema: {
      ref: z.string().default("HEAD").describe("Commit, branch or tag"),
      path: z.string().optional().describe("Only show changes to this file"),
    },
    annotations: READ_ONLY,
  },
  async ({ ref, path }) => {
    try {
      const out = await git("diff", `${ref}~1`, ref, ...(path ? ["--", path] : []));
      if (out.length <= MAX_CHARS) return text(out || "No changes.");
      return text(
        `${out.slice(0, MAX_CHARS)}\n\n[truncated ${out.length - MAX_CHARS} more characters. Pass \`path\` to narrow it down.]`,
      );
    } catch (err) {
      return gitProblem(err, ref);
    }
  },
);
// #endregion

// #region pagination
const PAGE = 20;

server.registerTool(
  "search_code",
  {
    title: "Search code",
    description:
      "Find a literal text pattern in tracked files. Returns file:line:text, 20 per page. " +
      "If more results exist, the reply ends with the cursor for the next page.",
    inputSchema: {
      pattern: z.string().min(1).describe("Literal text to look for (not a regex)"),
      cursor: z.number().int().min(0).default(0).describe("Offset from the previous reply"),
    },
    annotations: READ_ONLY,
  },
  async ({ pattern, cursor }) => {
    let lines: string[];
    try {
      lines = (await git("grep", "-n", "-I", "-F", "-e", pattern)).split("\n");
    } catch {
      return text(`No matches for '${pattern}'. Try a shorter pattern.`);
    }
    const page = lines.slice(cursor, cursor + PAGE);
    const next = cursor + PAGE;
    const footer =
      next < lines.length
        ? `\n\nShowing ${cursor + 1}-${cursor + page.length} of ${lines.length}. Call again with cursor=${next} for more.`
        : `\n\nShowing all ${lines.length} matches.`;
    return text(page.join("\n") + footer);
  },
);
// #endregion

server.registerTool(
  "list_todos",
  {
    title: "TODO list",
    description: "List every TODO and FIXME comment in the repo, with file and line.",
    annotations: READ_ONLY,
  },
  async () => {
    try {
      return text(await git("grep", "-n", "-I", "-E", "TODO|FIXME"));
    } catch {
      return text("No TODO or FIXME comments found.");
    }
  },
);

console.error(`repopilot ready, repo: ${REPO}`);
await server.connect(new StdioServerTransport());
