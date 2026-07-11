import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.OSTACK_WEB_PORT ?? 4320);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

createServer(async (request, response) => {
  const requested = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = requested === "/" ? "index.html" : requested.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) { response.writeHead(403); response.end("Forbidden"); return; }
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:4310",
      "x-content-type-options": "nosniff"
    });
    response.end(content);
  } catch { response.writeHead(404); response.end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`OStack Web listening on http://127.0.0.1:${port}`));
