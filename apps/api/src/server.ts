import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./routes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.OSTACK_PORT ?? 4310);

// Only the local dashboard may read the API from a browser context.
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:4320", "http://localhost:4320"]);

const server = createServer(async (request, response) => {
  setSecurityHeaders(request, response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  try {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const result = await handleApiRequest(root, request.method ?? "GET", path);
    json(response, result.status, result.body);
  } catch (error) {
    console.error("Request failed", error instanceof Error ? error.message : error);
    json(response, 500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`OStack API listening on http://127.0.0.1:${port}`));

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setSecurityHeaders(request: IncomingMessage, response: ServerResponse<IncomingMessage>): void {
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("cache-control", "no-store");
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-methods", "GET");
  }
}
