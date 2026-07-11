import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server exposes read-only OStack tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-mcp-"));
  await mkdir(join(root, ".ostack"));
  await writeFile(join(root, ".ostack/config.json"), JSON.stringify({ project: { id: "mcp-test", name: "MCP Test", root: "." } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  env.OSTACK_PROJECT_ROOT = root;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(import.meta.dirname, "../src/server.ts")],
    cwd: join(import.meta.dirname, "../../.."),
    env
  });
  const client = new Client({ name: "ostack-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "ostack_discover", "ostack_doctor", "ostack_explain_security_level", "ostack_get_run", "ostack_list_runs"
    ]);
    const result = await client.callTool({ name: "ostack_doctor", arguments: {} });
    assert.equal(result.isError, undefined);
    const discovery = await client.callTool({ name: "ostack_discover", arguments: {} });
    assert.equal(discovery.isError, undefined);
  } finally { await client.close(); }
});
