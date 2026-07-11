import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceSandbox } from "../src/index.js";

const writer = { id: "agent", kind: "agent" as const, roles: ["local-writer"] };

test("workspace session previews and rolls back updates and creations", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-workspace-"));
  await writeFile(join(root, "existing.txt"), "before\n");
  const session = await new WorkspaceSandbox(root, writer).begin("project");
  const update = await session.write("existing.txt", "after\n");
  const creation = await session.write("src/new.txt", "new\n");
  assert.match(update.diff, /^--- a\/existing\.txt/m);
  assert.equal(creation.kind, "create");
  await session.rollback();
  assert.equal(await readFile(join(root, "existing.txt"), "utf8"), "before\n");
  await assert.rejects(readFile(join(root, "src/new.txt")), /ENOENT/);
});

test("workspace denies traversal, protected paths, symlinks and unauthorized agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-workspace-"));
  await mkdir(join(root, "safe"));
  await symlink(tmpdir(), join(root, "safe/link"));
  await assert.rejects(new WorkspaceSandbox(root, { id: "reader", kind: "agent", roles: [] }).begin("project"), /local-writer/);
  const session = await new WorkspaceSandbox(root, writer).begin("project");
  await assert.rejects(session.write("../escape.txt", "bad"), /escapes workspace/);
  await assert.rejects(session.write(".env", "bad"), /Protected path/);
  await assert.rejects(session.write("safe/link/escape.txt", "bad"), /Symbolic link traversal denied/);
  await session.rollback();
});

test("committed session produces content hashes and cannot be reused", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-workspace-"));
  const session = await new WorkspaceSandbox(root, writer).begin("project");
  await session.write("file.txt", "content");
  const manifest = session.commit();
  assert.equal(manifest.changes[0]?.afterHash.length, 64);
  await assert.rejects(session.write("other.txt", "content"), /closed/);
});

test("staging produces a preview without touching the filesystem", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-workspace-"));
  await writeFile(join(root, "file.txt"), "before");
  const session = await new WorkspaceSandbox(root, writer).begin("project");
  await session.stage("file.txt", "after");
  assert.equal(await readFile(join(root, "file.txt"), "utf8"), "before");
  assert.throws(() => session.commit(), /must be applied/);
  await session.rollback();
});

test("rollback continues restoring earlier files when one path cannot be restored", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-workspace-"));
  await writeFile(join(root, "first.txt"), "before");
  const session = await new WorkspaceSandbox(root, writer).begin("project");
  await session.stage("first.txt", "after");
  await session.stage("blocked", "content");
  await mkdir(join(root, "blocked"));
  await assert.rejects(session.apply());
  await assert.rejects(session.rollback(), /Rollback incomplete/);
  assert.equal(await readFile(join(root, "first.txt"), "utf8"), "before");
});
