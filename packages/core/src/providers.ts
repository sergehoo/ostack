import type { ModelProvider, ModelRequest, ModelResponse } from "./types.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`Provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }

  list(): string[] { return [...this.providers.keys()].sort(); }

  async select(preferred: string[]): Promise<ModelProvider> {
    for (const id of preferred) {
      const provider = this.providers.get(id);
      if (provider && await provider.isAvailable()) return provider;
    }
    throw new Error(`No available AI provider among: ${preferred.join(", ")}`);
  }
}

export class MockProvider implements ModelProvider {
  readonly id = "mock";
  async isAvailable(): Promise<boolean> { return true; }
  async complete(request: ModelRequest): Promise<ModelResponse> {
    return { content: `Mock response for: ${request.messages.at(-1)?.content ?? "empty request"}`, model: "deterministic-test", provider: this.id };
  }
}
