import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const server = new McpServer(
  { name: "repopilot", version: "0.6.0" },
  { capabilities: { logging: {} } },
);

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

// #region direct
server.registerResource(
  "readme",
  "repo://readme",
  {
    title: "README",
    description: "The project README",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: await readFile(join(REPO, "README.md"), "utf8"),
      },
    ],
  }),
);

server.registerResource(
  "structure",
  "repo://structure",
  {
    title: "File tree",
    description: "Every tracked file, as a JSON array",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify((await git("ls-files")).split("\n"), null, 2),
      },
    ],
  }),
);
// #endregion

// #region template
const mimeFor = (p: string) =>
  p.endsWith(".md")
    ? "text/markdown"
    : p.endsWith(".json")
      ? "application/json"
      : p.endsWith(".js")
        ? "text/javascript"
        : "text/plain";

server.registerResource(
  "file",
  new ResourceTemplate("repo://file/{+path}", {
    list: async () => ({
      resources: (await git("ls-files")).split("\n").map((p) => ({
        uri: `repo://file/${p}`,
        name: p,
        mimeType: mimeFor(p),
      })),
    }),
  }),
  { title: "A file", description: "The contents of one tracked file" },
  async (uri, { path }) => {
    const rel = decodeURIComponent(String(path)); // clients percent-encode paths
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: mimeFor(rel),
          text: await readFile(join(REPO, rel), "utf8"),
        },
      ],
    };
  },
);
// #endregion

// #region prompts
const userMessage = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

server.registerPrompt(
  "code_review",
  {
    title: "Review a commit",
    description: "Review one commit for bugs, risk and clarity",
    argsSchema: { ref: z.string().optional().describe("Commit to review, default HEAD") },
  },
  ({ ref }) =>
    userMessage(
      `Review commit ${ref ?? "HEAD"}. Read it with git_diff, then point out bugs, risky changes ` +
        "and unclear names. End with the single most valuable improvement. Be specific and short.",
    ),
);

server.registerPrompt(
  "standup",
  {
    title: "Standup notes",
    description: "What I did recently, ready to paste into a standup",
    argsSchema: { days: z.string().optional().describe("How many days back, default 1") },
  },
  ({ days }) =>
    userMessage(
      `Use what_changed_since with '${days ?? "1"} days ago' and write my standup: ` +
        "yesterday, today, blockers. Three short bullets each, plain language.",
    ),
);

server.registerPrompt(
  "release_notes",
  {
    title: "Release notes",
    description: "Turn recent commits into user-facing release notes",
    argsSchema: { since: z.string().describe("A git date such as '2026-09-28'") },
  },
  ({ since }) =>
    userMessage(
      `Write release notes for changes since ${since}. Use git_log and git_diff. ` +
        "Group into New, Improved, Fixed. Skip internal refactors.",
    ),
);
// #endregion

// #region progress
// Runs `node --test`; calls onTest for every finished test, resolves with the totals
function runTests(onTest: (line: string, count: number) => void) {
  return new Promise<{ pass: string; failed: string; lines: string[] }>((resolve) => {
    const child = spawn("node", ["--test", "--test-reporter=tap"], { cwd: REPO });
    let out = "";
    let count = 0;
    child.stdout.on("data", (chunk) => {
      out += chunk;
      for (const line of String(chunk).split("\n")) {
        if (/^(not )?ok \d+/.test(line)) onTest(line, ++count);
      }
    });
    child.on("close", () =>
      resolve({
        pass: /^# pass (\d+)/m.exec(out)?.[1] ?? "0",
        failed: /^# fail (\d+)/m.exec(out)?.[1] ?? "0",
        lines: out.split("\n").filter((l) => /^(not )?ok/.test(l)),
      }),
    );
  });
}

server.registerTool(
  "run_tests",
  {
    title: "Run tests",
    description:
      "Run the repo's test suite and report how many tests passed and failed. Can take a while.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (extra) => {
    const token = extra._meta?.progressToken;
    const r = await runTests((line, count) => {
      if (token === undefined) return;
      void extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress: count, message: line },
      });
    });
    await server.sendLoggingMessage({
      level: "info",
      data: `tests finished: ${r.pass} passed, ${r.failed} failed`,
    });
    return {
      ...text(`${r.pass} passed, ${r.failed} failed.\n\n${r.lines.join("\n")}`),
      isError: r.failed !== "0",
    };
  },
);
// #endregion

console.error(`repopilot ready, repo: ${REPO}`);
await server.connect(new StdioServerTransport());
