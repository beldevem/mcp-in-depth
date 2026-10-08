# handson/mcp: RepoPilot, the running project of "MCP in Depth" (TypeScript)

RepoPilot is an MCP server that lets Claude understand and work on a git repository. One folder per video, each a complete
and tested state of the project. Slide code is pulled from these files.

```
npm install
./setup-demo-repo.sh          # creates ./demo-repo
npx tsc -p .                  # type-check everything
```

| Folder | Video | What it holds |
|---|---|---|
| part01 | What is MCP? | Hello server (one `add` tool) |
| part02 | Your first server | git_log, git_diff, search_code, list_todos, github_issues |
| part03 | Designing tools | what_changed_since (structured), errors, truncation, pagination, annotations, selection eval |
| part04 | Build a client | call.ts (no AI), client.ts (Claude loop with approvals) |
| part05 | Resources | repo://readme, repo://structure, repo://file/{+path}, read.ts |
| part06 | Prompts | /code_review, /standup, /release_notes, run_tests with progress |
| part07 | Transports | server factory, stdio.ts, http.ts (stateless), http-stateful.ts, mount.ts, Dockerfile |
| part08 | Security | path sandbox, ref validation, confirmation, bearer auth, `attack.ts` |
| part09 | Test, monitor, ship | tests, contract snapshot, logging, audit trail, npm package, .mcp.json |

Helpers in this folder: `probe.ts` (call one tool), `probe-read.ts` (read one resource), `attack.ts` (replay the Part 8 attacks).
Run any server in the Inspector first: `npx @modelcontextprotocol/inspector npx tsx part02/server.ts`.
Set `REPOPILOT_REPO=./demo-repo` to point a server at the demo repository.

Not exercised in automated checks: the real Claude API calls (`part03/select.ts`, `part04/client.ts`; the loop itself was run against a local fake API) and `claude mcp add`.
