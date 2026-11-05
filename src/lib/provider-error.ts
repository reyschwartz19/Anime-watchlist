/** Public, sanitized provider failures. Never attach upstream response bodies. */
export class ProviderError extends Error {
  constructor(
    public kind: 'catalog' | 'model',
    message: string,
    public code: 'unavailable' | 'timeout' | 'rate_limit' | 'invalid_response' | 'unconfigured' = 'unavailable',
    public retryAfterSeconds?: number,
  ) { super(message); }
}

/** Bound bytes while reading, including responses without Content-Length. */
export async function readProviderText(response: Response, maximumBytes: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maximumBytes) throw new Error('Oversized response');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0; let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); throw new Error('Oversized response'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
