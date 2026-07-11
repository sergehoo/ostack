import test from "node:test";
import assert from "node:assert/strict";
import { SchemaValidator } from "../src/index.js";

test("schema validator returns stable paths and all errors", () => {
  const result = new SchemaValidator().validate({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object", required: ["name", "level"], properties: { name: { type: "string" }, level: { type: "integer", minimum: 1, maximum: 4 } }, additionalProperties: false
  }, { level: 8, extra: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors.some((error) => error.path === "/level"), true);
});
