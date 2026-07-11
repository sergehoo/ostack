import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EphemeralWorkspace } from "../src/index.js";

test("ephemeral workspace copies source while excluding state, secrets and unsafe links", async () => {
  const source = await mkdtemp(join(tmpdir(), "ostack-source-"));
  await mkdir(join(source, "src"));
  await mkdir(join(source, ".git"));
  await mkdir(join(source, ".ostack"));
  await mkdir(join(source, "dist"));
  await writeFile(join(source, "src/app.ts"), "export {};");
  await writeFile(join(source, ".env"), "SECRET=value");
  await writeFile(join(source, ".npmrc"), "//registry/:_authToken=value");
  await writeFile(join(source, ".git/config"), "git");
  await writeFile(join(source, ".ostack/config.json"), "{}");
  await writeFile(join(source, "dist/app.js"), "built");
  await symlink("app.ts", join(source, "src/internal-link.ts"));
  await symlink(join(source, "src/app.ts"), join(source, "absolute-link.ts"));
  const isolated = await EphemeralWorkspace.create(source);
  const isolatedPath = isolated.report.path;
  assert.equal(await readFile(join(isolatedPath, "src/app.ts"), "utf8"), "export {};");
  assert.equal(await readFile(join(isolatedPath, "src/internal-link.ts"), "utf8"), "export {};");
  await assert.rejects(access(join(isolatedPath, ".env")));
  await assert.rejects(access(join(isolatedPath, ".npmrc")));
  await assert.rejects(access(join(isolatedPath, ".git")));
  await assert.rejects(access(join(isolatedPath, ".ostack")));
  await assert.rejects(access(join(isolatedPath, "dist")));
  await assert.rejects(access(join(isolatedPath, "absolute-link.ts")));
  assert.equal(isolated.report.excludedPaths.some((path) => path.includes("absolute-link.ts")), true);
  await isolated.cleanup();
  await assert.rejects(access(isolatedPath));
});

test("cleanup is idempotent", async () => {
  const source = await mkdtemp(join(tmpdir(), "ostack-source-"));
  await writeFile(join(source, "file.txt"), "content");
  const isolated = await EphemeralWorkspace.create(source, { includeDependencies: false });
  await isolated.cleanup();
  await isolated.cleanup();
});
