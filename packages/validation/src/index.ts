import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

export interface ValidationResult { valid: boolean; errors: Array<{ path: string; message: string; keyword: string }>; }

export class SchemaValidator {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });

  validate(schema: object, data: unknown): ValidationResult {
    const id = (schema as { $id?: unknown }).$id;
    const validate = typeof id === "string" ? (this.ajv.getSchema(id) ?? this.ajv.compile(schema)) : this.ajv.compile(schema);
    const valid = validate(data);
    return { valid: Boolean(valid), errors: (validate.errors ?? []).map(formatError) };
  }
}

function formatError(error: ErrorObject): { path: string; message: string; keyword: string } {
  return { path: error.instancePath || "/", message: error.message ?? "invalid value", keyword: error.keyword };
}
