import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaValidator, type ValidationResult } from "@ostack/validation";

export interface BuiltInValidation { name: string; valid: boolean; errors: ValidationResult["errors"]; }

export async function validateBuiltIns(frameworkRoot: string): Promise<BuiltInValidation[]> {
  const pairs = [
    ["agent catalog", "schemas/agent-catalog.schema.json", "agents/catalog.json"],
    ["feature workflow", "schemas/workflow.schema.json", "workflows/feature-delivery.json"],
    ["software lifecycle", "schemas/workflow.schema.json", "workflows/software-lifecycle.json"],
    ["security policy", "schemas/policy.schema.json", "policies/security.json"],
    ["example change plan", "schemas/change-plan.schema.json", "examples/change-plan.json"],
    ["example evidence input", "schemas/evidence-input.schema.json", "examples/evidence-input.json"],
    ["example intent draft", "schemas/intent-draft.schema.json", "examples/intent-draft.json"],
    ["example security authorization", "schemas/security-authorization.schema.json", "examples/security-authorization.json"],
    ["standard typescript-node", "schemas/standard.schema.json", "standards/typescript-node.json"],
    ["standard python-django", "schemas/standard.schema.json", "standards/python-django.json"],
    ["standard react-frontend", "schemas/standard.schema.json", "standards/react-frontend.json"],
    ["benchmark core suite", "schemas/benchmark-suite.schema.json", "benchmarks/core-suite.json"]
  ] as const;
  const validator = new SchemaValidator();
  return Promise.all(pairs.map(async ([name, schemaPath, documentPath]) => {
    const [schema, document] = await Promise.all([
      readJson(join(frameworkRoot, schemaPath)), readJson(join(frameworkRoot, documentPath))
    ]);
    const result = validator.validate(schema as object, document);
    return { name, ...result };
  }));
}

async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }
