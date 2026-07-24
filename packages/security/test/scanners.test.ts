import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseSemgrep, parseGitleaks, parseTrivy, parseHadolint, SCANNERS, assembleSecurityEvidence } from "../src/index.js";

// Fixtures mirror each tool's documented JSON shape.

test("parseSemgrep maps results to findings with severity and location", () => {
  const output = {
    results: [
      { check_id: "javascript.lang.security.audit.sqli", path: "src/db.js", start: { line: 42 }, extra: { message: "Requête SQL construite par concaténation.", severity: "ERROR" } },
      { check_id: "generic.secrets.hardcoded", path: "src/conf.js", start: { line: 3 }, extra: { message: "Valeur codée en dur.", severity: "WARNING" } },
    ],
    errors: [],
  };
  const findings = parseSemgrep(output);
  assert.equal(findings.length, 2);
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.file, "src/db.js:42");
  assert.match(findings[0]?.evidence ?? "", /sqli/);
  assert.equal(findings[1]?.severity, "medium");
});

test("parseSemgrep tolerates empty or malformed output", () => {
  assert.deepEqual(parseSemgrep({}), []);
  assert.deepEqual(parseSemgrep(null), []);
  assert.deepEqual(parseSemgrep({ results: "nope" }), []);
});

test("parseGitleaks flags secrets as critical AND never stores the secret value (§24)", () => {
  const output = [
    { RuleID: "aws-access-token", File: "src/config.js", StartLine: 12, Secret: "AKIAIOSFODNN7EXAMPLE", Match: "key=AKIAIOSFODNN7EXAMPLE", Description: "AWS token" },
  ];
  const findings = parseGitleaks(output);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, "critical");
  assert.equal(findings[0]?.file, "src/config.js:12");
  // The raw secret and match must appear NOWHERE in the finding.
  const serialized = JSON.stringify(findings[0]);
  assert.ok(!serialized.includes("AKIAIOSFODNN7EXAMPLE"), "le secret ne doit jamais être stocké");
  assert.ok(!serialized.includes("key=AKIAIOSFODNN7EXAMPLE"), "le match ne doit jamais être stocké");
  assert.match(findings[0]?.evidence ?? "", /rédigée/);
});

test("parseTrivy maps vulnerabilities and misconfigurations with fix guidance", () => {
  const output = {
    Results: [
      {
        Target: "package-lock.json",
        Vulnerabilities: [
          { VulnerabilityID: "CVE-2024-0001", PkgName: "leftpad", InstalledVersion: "1.0.0", FixedVersion: "1.0.1", Severity: "HIGH", Title: "Prototype pollution" },
        ],
        Misconfigurations: [
          { ID: "DS002", Title: "Root user", Severity: "MEDIUM", Description: "Conteneur en root", Resolution: "Ajouter USER non-root" },
        ],
      },
    ],
  };
  const findings = parseTrivy(output);
  assert.equal(findings.length, 2);
  const vuln = findings.find((f) => f.id.startsWith("trivy:CVE"));
  assert.equal(vuln?.severity, "high");
  assert.match(vuln?.remediation ?? "", /1\.0\.1/);
  const misc = findings.find((f) => f.id.startsWith("trivy:DS002"));
  assert.equal(misc?.severity, "medium");
  assert.match(misc?.remediation ?? "", /non-root/);
});

test("parseTrivy tolerates missing sections", () => {
  assert.deepEqual(parseTrivy({}), []);
  assert.deepEqual(parseTrivy({ Results: [{ Target: "x" }] }), []);
});

test("scanner findings feed the evidence pack and a critical secret BLOCKS release", () => {
  const findings = parseGitleaks([{ RuleID: "aws-access-token", File: "src/config.js", StartLine: 12, Secret: "REDACT_ME" }]);
  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: "local", production: false }, findings });
  assert.equal(pack.recommendation, "BLOCKED");
  assert.ok(!JSON.stringify(pack).includes("REDACT_ME"));
});

test("SCANNERS catalog covers sast, secrets and sca and only known tools", () => {
  const tools = SCANNERS.map((s) => s.tool);
  assert.deepEqual(tools, ["semgrep", "gitleaks", "trivy"]);
  assert.deepEqual([...new Set(SCANNERS.map((s) => s.category))].sort(), ["sast", "sca", "secrets"]);
});

test("parseHadolint maps Dockerfile issues by level", () => {
  const output = [
    { file: "Dockerfile", line: 1, code: "DL3006", level: "warning", message: "Always tag the version of an image explicitly" },
    { file: "Dockerfile", line: 5, code: "DL3002", level: "error", message: "Last USER should not be root" },
  ];
  const findings = parseHadolint(output);
  assert.equal(findings.length, 2);
  assert.equal(findings[0]?.severity, "medium");
  assert.equal(findings[1]?.severity, "high");
  assert.equal(findings[1]?.file, "Dockerfile:5");
});
