import assert from "node:assert/strict";
import { test } from "node:test";
import { checkArchitecture, extractImports, matchesPattern, type ArchitectureRule } from "../src/index.js";

const RULES: ArchitectureRule[] = [
  { name: "core-independent", source: "packages/core/**", forbiddenDependencies: ["@ostack/*"] },
  { name: "no-apps-from-packages", source: "packages/**", forbiddenDependencies: ["apps/**", "@ostack/api"] }
];

test("import extraction covers static, dynamic, side-effect, require and re-export forms", () => {
  const content = `
    import { a } from "@ostack/core";
    import type { B } from "./local.js";
    import "polyfill";
    const c = await import("@ostack/graph");
    const d = require("node:fs");
    export { e } from "../sibling.js";
  `;
  assert.deepEqual(extractImports(content), ["../sibling.js", "./local.js", "@ostack/core", "@ostack/graph", "node:fs", "polyfill"]);
});

test("pattern matching: directory globs, package subpaths, wildcards", () => {
  assert.ok(matchesPattern("packages/core/src/types.ts", "packages/core/**"));
  assert.ok(!matchesPattern("packages/corex/src/a.ts", "packages/core/**"));
  assert.ok(matchesPattern("@ostack/providers", "@ostack/*"));
  assert.ok(matchesPattern("@ostack/providers/dist/x.js", "@ostack/providers"));
  assert.ok(!matchesPattern("node:fs", "@ostack/*"));
});

test("violations name the rule, the file and the offending import; clean code passes", () => {
  const violations = checkArchitecture(RULES, [
    { file: "packages/core/src/orchestrator.ts", specifiers: ["node:crypto", "@ostack/providers"] },
    { file: "packages/graph/src/index.ts", specifiers: ["@ostack/intent", "apps/api/src/routes.js"] },
    { file: "packages/intent/src/compile.ts", specifiers: ["node:crypto"] }
  ]);
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map((violation) => violation.rule), ["core-independent", "no-apps-from-packages"]);
  assert.equal(violations[1]?.specifier, "apps/api/src/routes.js");
});
