import test from "node:test";
import assert from "node:assert/strict";
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from "../src/index.js";

const request = { system: "Be precise", messages: [{ role: "user" as const, content: "Hello" }] };

test("OpenAI adapter uses Responses API and normalizes usage", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ model: "model", output_text: "answer", usage: { input_tokens: 4, output_tokens: 2 } });
  }) as typeof fetch;
  const response = await new OpenAIProvider({ apiKey: "test-key", defaultModel: "model", fetcher }).complete(request);
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedBody.instructions, "Be precise");
  assert.equal(response.content, "answer");
  assert.deepEqual(response.usage, { inputTokens: 4, outputTokens: 2 });
});

test("Anthropic adapter normalizes text blocks", async () => {
  const fetcher = (async () => Response.json({ model: "claude", content: [{ type: "text", text: "one" }, { type: "text", text: " two" }] })) as typeof fetch;
  const response = await new AnthropicProvider({ apiKey: "test-key", fetcher }).complete(request);
  assert.equal(response.content, "one two");
});

test("Ollama adapter checks local availability and chat response", async () => {
  const fetcher = (async (input: string | URL | Request) => String(input).endsWith("/api/tags")
    ? Response.json({ models: [] })
    : Response.json({ model: "qwen3", message: { role: "assistant", content: "local" }, prompt_eval_count: 3, eval_count: 1 })) as typeof fetch;
  const provider = new OllamaProvider({ fetcher });
  assert.equal(await provider.isAvailable(), true);
  assert.equal((await provider.complete(request)).content, "local");
});

test("HTTP adapters propagate caller cancellation to fetch", async () => {
  let capturedSignal: AbortSignal | null | undefined;
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      capturedSignal?.addEventListener("abort", () => reject(capturedSignal?.reason), { once: true });
    });
  }) as typeof fetch;
  const controller = new AbortController();
  const completion = new OpenAIProvider({ apiKey: "test-key", fetcher }).complete({
    ...request,
    signal: controller.signal
  });
  controller.abort(new Error("cancelled by caller"));
  await assert.rejects(completion, /cancelled by caller/);
  assert.equal(capturedSignal?.aborted, true);
});
