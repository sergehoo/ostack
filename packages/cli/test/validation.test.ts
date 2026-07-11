import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { validateBuiltIns } from "../src/validation.js";

test("all built-in declarative assets satisfy their schemas", async () => {
  const results = await validateBuiltIns(join(import.meta.dirname, "../../.."));
  assert.deepEqual(results.filter((result) => !result.valid), []);
});
