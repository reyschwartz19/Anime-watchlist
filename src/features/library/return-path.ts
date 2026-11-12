export function safeReturnPath(input: unknown): string {
  if (typeof input !== 'string' || !/^\/(library|search|recommendations)(?:\?|$)/.test(input) || input.includes('\\') || input.length > 4096) return '/recommendations';
  const url = new URL(input, 'https://local.invalid');
  return `${url.pathname}${url.search}`;
}
