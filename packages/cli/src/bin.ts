#!/usr/bin/env node
import { commands } from "./commands.js";

const [commandName, ...rawArgs] = process.argv.slice(2);
const json = rawArgs.includes("--json");
const args = rawArgs.filter((arg) => arg !== "--json");

if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
  console.log("OStack — AI Software Engineering Operating System\n\nUsage: ostack <command> [options]\n");
  for (const [name, command] of Object.entries(commands)) console.log(`  ${name.padEnd(14)} ${command.description}`);
  console.log("\nOptions:\n  --json         Structured output");
  process.exit(0);
}

const command = commands[commandName];
if (!command) {
  console.error(`Unknown command: ${commandName}. Run 'ostack help'.`);
  process.exit(2);
}

try {
  const result = await command.handler({ cwd: process.cwd(), args, json });
  console.log(json ? JSON.stringify(result, null, 2) : format(result));
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  const message = code === "EEXIST" ? "OStack is already initialized in this project." : error instanceof Error ? error.message : String(error);
  console.error(json ? JSON.stringify({ error: message, code: code ?? "OSTACK_ERROR" }) : `Error: ${message}`);
  process.exit(1);
}

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "checks" in value) {
    const data = value as { healthy: boolean; checks: Array<{ name: string; status: string; detail: string }> };
    return `${data.healthy ? "✓" : "!"} OStack doctor\n${data.checks.map((check) => `${check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗"} ${check.name}: ${check.detail}`).join("\n")}`;
  }
  return JSON.stringify(value, null, 2);
}
