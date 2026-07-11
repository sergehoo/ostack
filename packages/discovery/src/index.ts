import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, opendir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IGNORED_DIRECTORIES = new Set([".git", ".ostack", "node_modules", "dist", "build", "coverage", ".next", ".venv", "venv", "vendor", "target"]);
const SECRET_NAMES = /(^|\/)(\.env(?:\..*)?|.*\.(pem|key|p12|pfx)|id_rsa|id_ed25519)$/i;
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".py": "Python", ".go": "Go",
  ".java": "Java", ".kt": "Kotlin", ".cs": "C#", ".php": "PHP", ".rb": "Ruby", ".rs": "Rust", ".dart": "Dart",
  ".vue": "Vue", ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".md": "Markdown", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML"
};

export interface ProjectDiscoveryReport {
  schemaVersion: 1;
  generatedAt: string;
  rootName: string;
  fingerprint: string;
  inventory: { files: number; directories: number; bytes: number; truncated: boolean };
  languages: Array<{ name: string; files: number; percentage: number }>;
  frameworks: string[];
  packageManagers: string[];
  infrastructure: string[];
  knowledgeCandidates: string[];
  entryPoints: string[];
  git: { available: boolean; branch?: string; changedFiles?: number };
  warnings: string[];
}

export interface DiscoveryOptions { maxFiles?: number; maxFileBytes?: number; }

export async function discoverProject(root: string, options: DiscoveryOptions = {}): Promise<ProjectDiscoveryReport> {
  const maxFiles = options.maxFiles ?? 20_000;
  const maxFileBytes = options.maxFileBytes ?? 2_000_000;
  const files: Array<{ path: string; size: number }> = [];
  let directories = 0;
  let truncated = false;

  async function walk(directory: string): Promise<void> {
    if (files.length >= maxFiles) { truncated = true; return; }
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (files.length >= maxFiles) { truncated = true; break; }
      if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".gitlab-ci.yml") continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute);
      if (SECRET_NAMES.test(path) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { directories++; await walk(absolute); }
      else if (entry.isFile()) {
        const info = await lstat(absolute);
        files.push({ path, size: info.size });
      }
    }
  }
  await walk(root);

  const languageCounts = new Map<string, number>();
  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[extname(file.path).toLowerCase()];
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }
  const languageTotal = [...languageCounts.values()].reduce((sum, count) => sum + count, 0) || 1;
  const names = new Set(files.map((file) => file.path));
  const manifests = await readManifests(root, names, maxFileBytes);
  const frameworks = detectFrameworks(manifests, names);
  const git = await inspectGit(root);
  const fingerprint = createHash("sha256").update(files.map((file) => `${file.path}:${file.size}`).sort().join("\n")).digest("hex");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootName: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root,
    fingerprint,
    inventory: { files: files.length, directories, bytes: files.reduce((sum, file) => sum + file.size, 0), truncated },
    languages: [...languageCounts].map(([name, count]) => ({ name, files: count, percentage: Math.round(count / languageTotal * 1000) / 10 })).sort((a, b) => b.files - a.files),
    frameworks,
    packageManagers: detectPackageManagers(names),
    infrastructure: detectInfrastructure(names),
    knowledgeCandidates: files.map((file) => file.path).filter((path) => /(^|\/)(AGENTS\.md|README[^/]*|docs\/.*|.*\.(md|ya?ml))$/i.test(path)).slice(0, 500),
    entryPoints: files.map((file) => file.path).filter((path) => /(^|\/)(main|index|server|app|manage)\.(ts|tsx|js|jsx|py|go|java|cs|php)$/i.test(path)).slice(0, 100),
    git,
    warnings: [
      ...(truncated ? [`Inventory truncated at ${maxFiles} files`] : []),
      ...(!git.available ? ["Git repository not detected"] : []),
      ...(!names.has("README.md") ? ["README.md not found"] : []),
      ...(!names.has("AGENTS.md") ? ["AGENTS.md not found"] : [])
    ]
  };
}

async function readManifests(root: string, names: Set<string>, maxBytes: number): Promise<Record<string, string>> {
  const manifests: Record<string, string> = {};
  for (const name of ["package.json", "pyproject.toml", "requirements.txt", "composer.json", "go.mod", "pom.xml", "build.gradle", "pubspec.yaml"])
    if (names.has(name)) try {
      const content = await readFile(join(root, name), "utf8");
      if (Buffer.byteLength(content) <= maxBytes) manifests[name] = content;
    } catch { /* unreadable manifests are reported through absence */ }
  return manifests;
}

function detectFrameworks(manifests: Record<string, string>, names: Set<string>): string[] {
  const haystack = Object.values(manifests).join("\n").toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["React", /["']react["']/], ["Next.js", /["']next["']/], ["Vue", /["']vue["']/], ["Angular", /@angular\/core/],
    ["Django", /django/], ["FastAPI", /fastapi/], ["Laravel", /laravel\/framework/], ["Spring Boot", /spring-boot/],
    ["ASP.NET", /microsoft\.aspnetcore/], ["Flutter", /flutter:/], ["React Native", /react-native/]
  ];
  const detected = rules.filter(([, pattern]) => pattern.test(haystack)).map(([name]) => name);
  if ([...names].some((name) => name.endsWith(".csproj"))) detected.push(".NET");
  return [...new Set(detected)].sort();
}

function detectPackageManagers(names: Set<string>): string[] {
  const rules: Array<[string, string]> = [["npm", "package-lock.json"], ["pnpm", "pnpm-lock.yaml"], ["Yarn", "yarn.lock"], ["Poetry", "poetry.lock"], ["Composer", "composer.lock"], ["Go modules", "go.sum"], ["Maven", "pom.xml"], ["Gradle", "gradlew"]];
  return rules.filter(([, file]) => names.has(file)).map(([name]) => name);
}
function detectInfrastructure(names: Set<string>): string[] {
  const all = [...names];
  const rules: Array<[string, (path: string) => boolean]> = [
    ["Docker", (path) => /(^|\/)Dockerfile$/i.test(path) || /(^|\/)docker-compose.*\.ya?ml$/i.test(path)],
    ["Kubernetes", (path) => /(^|\/)(k8s|kubernetes|helm)\//i.test(path)], ["GitHub Actions", (path) => path.startsWith(".github/workflows/")],
    ["GitLab CI", (path) => path === ".gitlab-ci.yml"], ["Terraform", (path) => path.endsWith(".tf")]
  ];
  return rules.filter(([, match]) => all.some(match)).map(([name]) => name);
}
async function inspectGit(root: string): Promise<ProjectDiscoveryReport["git"]> {
  try {
    const [{ stdout: branch }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["branch", "--show-current"], { cwd: root, timeout: 2000 }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: root, timeout: 2000 })
    ]);
    return { available: true, branch: branch.trim() || "detached", changedFiles: status.split("\n").filter(Boolean).length };
  } catch { return { available: false }; }
}
