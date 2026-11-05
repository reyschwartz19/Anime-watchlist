import { previewEnabled } from '@/lib/preview';

export function GET(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  const title = (new URL(request.url).searchParams.get('title') ?? 'Anime').slice(0, 100);
  const escape = (value: string) => value.replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`);
  const words = title.split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length || lines.at(-1)!.length + word.length > 17) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const labels = lines.slice(0, 6).map((line, index) => `<text x="30" y="${130 + index * 42}" font-family="sans-serif" font-size="30" font-weight="700">${escape(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#F9EBD7"/><path d="M24 24H376V576H24Z" fill="none" stroke="#0F0F0B"/><path d="M30 60H370M30 510H370" stroke="#0F0F0B"/><g fill="#0F0F0B">${labels}<text x="30" y="546" font-family="sans-serif" font-size="16">Cover unavailable · Review fixture</text></g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
