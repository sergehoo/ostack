// OStack Architecture Intelligence (§19) — declared boundaries checked against
// ACTUAL imports before merge. Rules are data (policies/architecture.json),
// violations name the file, the rule and the offending import; detection is
// purely mechanical.

export interface ArchitectureRule {
  name: string;
  description?: string;
  source: string;
  forbiddenDependencies: string[];
}

export interface ImportRecord {
  file: string;
  specifiers: string[];
}

export interface ArchitectureViolation {
  rule: string;
  file: string;
  specifier: string;
  description?: string;
}

const IMPORT_PATTERNS = [
  /import\s+[^"']*?from\s+["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /import\s+["']([^"']+)["']/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  /export\s+[^"']*?from\s+["']([^"']+)["']/g
];

export function extractImports(content: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) specifiers.add(match[1]!);
  }
  return [...specifiers].sort();
}

// Pattern language kept deliberately small and predictable:
//   "packages/core/**"  → path prefix packages/core/
//   "@ostack/providers" → exact specifier or subpath of it
//   "node:*"            → any node builtin
export function matchesPattern(value: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -2);
    return value.startsWith(prefix);
  }
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern || value.startsWith(`${pattern}/`);
}

export function checkArchitecture(rules: ArchitectureRule[], records: ImportRecord[]): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  for (const rule of rules) {
    for (const record of records) {
      if (!matchesPattern(record.file, rule.source)) continue;
      for (const specifier of record.specifiers) {
        if (rule.forbiddenDependencies.some((pattern) => matchesPattern(specifier, pattern))) {
          violations.push({
            rule: rule.name, file: record.file, specifier,
            ...(rule.description !== undefined ? { description: rule.description } : {})
          });
        }
      }
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.specifier.localeCompare(b.specifier));
}
