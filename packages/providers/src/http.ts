export type FetchLike = typeof fetch;

export class ProviderHttpError extends Error {
  constructor(public readonly provider: string, public readonly status: number, message: string) {
    super(`${provider} request failed (${status}): ${message}`);
    this.name = "ProviderHttpError";
  }
}

export async function postJson<T>(
  fetcher: FetchLike,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 500).replace(/[\r\n]+/g, " ");
    throw new ProviderHttpError(provider, response.status, text || response.statusText);
  }
  return await response.json() as T;
}

export async function reachable(fetcher: FetchLike, url: string, headers: Record<string, string> = {}): Promise<boolean> {
  try { return (await fetcher(url, { method: "GET", headers, signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}
