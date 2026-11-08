// Web research for runs: find top-performing articles and read them.
//  - Hacker News (via Algolia's free API) gives real links ranked by points.
//  - Google News RSS gives fresh headlines; its links are obfuscated, so only
//    titles and publishers are used, as a signal for what's trending.
import { lookup } from 'node:dns';
import type { LookupAddress, LookupAllOptions, LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent, fetch } from 'undici';

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

// Everything that isn't the public internet. BlockList parses addresses
// properly, and checks IPv4-mapped IPv6 (::ffff:7f00:1, ::ffff:127.0.0.1)
// against the IPv4 rules, so the embedded address is what counts.
const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3], // multicast, reserved, broadcast
] as const) PRIVATE.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['2002::', 16],
] as const) PRIVATE.addSubnet(net, prefix, 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an address: refuse rather than guess
  return PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// Article links come from the internet, so never let one point the server at
// itself or the local network.
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported link.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Unsupported port.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookupAll(host);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Link points to a private address.');
  }
  return url;
}

const lookupAll = (host: string) =>
  new Promise<LookupAddress[]>((resolve, reject) => {
    lookup(host, { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses)));
  });

// DNS lookup for the page fetcher's sockets. The connection goes to exactly
// the addresses checked here, so a hostname can't pass assertPublicUrl and
// then resolve to a private address when fetch looks it up again (DNS
// rebinding). IP-literal hosts skip lookup and are checked by assertPublicUrl.
export function publicLookup(
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  lookup(hostname, { ...options, all: true } as LookupAllOptions, (err, addresses) => {
    if (err) return callback(err, []);
    const bad = addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address));
    if (bad) return callback(Object.assign(new Error('Link points to a private address.'), { code: 'EPRIVATE' }), []);
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

const publicAgent = new Agent({ connect: { lookup: publicLookup } });

async function fetchPage(raw: string): Promise<string> {
  let url = await assertPublicUrl(raw);
  for (let hops = 0; hops < 4; hops++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      dispatcher: publicAgent, // every hop connects only to checked addresses
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
