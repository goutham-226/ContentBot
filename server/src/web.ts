// Web research for runs: find top-performing articles and read them.
//  - Hacker News (via Algolia's free API) gives real links ranked by points.
//  - Google News RSS gives fresh headlines; its links are obfuscated, so only
//    titles and publishers are used, as a signal for what's trending.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const USER_AGENT = 'Mozilla/5.0 (compatible; TwinfluencerBot/0.1; research)';
const TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_ARTICLE_CHARS = 8000;

export type Article = {
  title: string;
  url: string | null;
  source: string;
  points: number | null; // engagement, when the source has it
};

export async function searchHackerNews(query: string, limit: number): Promise<Article[]> {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: '30' });
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { hits?: { title?: string; url?: string | null; points?: number }[] };
    return (body.hits ?? [])
      .filter((h) => h.title && h.url)
      .map((h) => ({ title: h.title as string, url: h.url as string, source: 'Hacker News', points: h.points ?? 0 }))
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export async function searchGoogleNews(query: string, limit: number): Promise<Article[]> {
  const params = new URLSearchParams({ q: `${query} when:30d`, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  try {
    const res = await fetch(`https://news.google.com/rss/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map(([, item]) => {
      const title = decodeEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const source = decodeEntities(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? 'Google News');
      return { title: title.replace(new RegExp(` - ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''), url: null, source, points: null };
    });
  } catch {
    return [];
  }
}

// --- Reading pages -------------------------------------------------------

function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const lower = address.toLowerCase();
  return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

// Article links come from the internet, so never let one point the server at
// itself or the local network.
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported link.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Unsupported port.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Link points to a private address.');
  }
  return url;
}

async function fetchPage(raw: string): Promise<string> {
  let url = await assertPublicUrl(raw);
  for (let hops = 0; hops < 4; hops++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get('content-type') ?? '').includes('html')) throw new Error('Not a web page.');

    // Read at most MAX_PAGE_BYTES.
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Too many redirects.');
}

// Pulls readable paragraph text out of an article page.
function extractText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const paragraphs = [...body.matchAll(/<(p|h1|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(([, , inner]) => decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 40);
  return paragraphs.join('\n').slice(0, MAX_ARTICLE_CHARS);
}

// Returns the article's text, or null if it couldn't be read.
export async function readArticle(url: string): Promise<string | null> {
  try {
    const text = extractText(await fetchPage(url));
    return text.length >= 400 ? text : null;
  } catch {
    return null;
  }
}
