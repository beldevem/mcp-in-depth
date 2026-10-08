import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { connect, makeRepo } from "./helpers.js";

const repo = makeRepo();
const client = await connect(repo);
const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

// #region tests
test("git_log returns the commits, newest first", async () => {
  const out = textOf(await client.callTool({ name: "git_log", arguments: { limit: 5 } }));
  assert.match(out.split("\n")[0], /second/);
  assert.match(out.split("\n")[1], /first/);
});

test("a bad ref gives an actionable error", async () => {
  const res = await client.callTool({
    name: "git_diff",
    arguments: { ref: "nope" },
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /Use git_log/);
});

test("option injection is rejected before git ever runs", async () => {
  const target = `${repo}/pwned.txt`;
  const res = await client
    .callTool({
      name: "git_diff",
      arguments: { ref: `--output=${target}` },
    })
    .catch((e) => e);
  assert.ok(res instanceof Error || res.isError);
  assert.equal(existsSync(target), false);
});

test("resources cannot escape the repository", async () => {
  await assert.rejects(client.readResource({ uri: "repo://file/..%2F..%2Fetc%2Fhostname" }));
});
// #endregion

// #region snapshot
// The tool contract: names and schemas. Changing it by accident breaks clients.
test("tool contract matches the snapshot", async () => {
  const { tools } = await client.listTools();
  const current = JSON.stringify(
    tools
      .map((t) => ({ name: t.name, inputSchema: t.inputSchema }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    null,
    2,
  );
  const file = new URL("./tools.snapshot.json", import.meta.url);
  if (process.env.UPDATE_SNAPSHOT || !existsSync(file)) writeFileSync(file, current + "\n");
  assert.equal(
    current + "\n",
    readFileSync(file, "utf8"),
    "Tool contract changed. If intended, rerun with UPDATE_SNAPSHOT=1",
  );
});
// #endregion

test.after(() => client.close());
