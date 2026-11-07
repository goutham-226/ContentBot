// Openly licensed book summaries for the knowledge base:
//  - Open Library finds the most-published books on a topic (a popularity signal).
//  - Wikipedia (CC BY-SA 4.0) supplies a summary of each; Open Library's own
//    description is the fallback.

const USER_AGENT = 'Twinfluencer/0.1 (book research; https://github.com/goutham-226)';
const TIMEOUT_MS = 10_000;
const MAX_SUMMARY_CHARS = 12_000;
const MIN_EDITIONS = 3;

export type BookSummary = {
  title: string;
  author: string;
  year: number | null;
  editions: number;
  summary: string;
  url: string;
  license: string;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  edition_count?: number;
  first_publish_year?: number;
  subject?: string[];
};

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

async function wikipediaSummary(title: string, author: string): Promise<{ text: string; url: string } | null> {
  const search = await getJson<{ query?: { search?: { title: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query', list: 'search', format: 'json', srlimit: '3',
      srsearch: `${title} ${author} book`,
    })}`,
  );
  const wanted = normalise(title).split(' ').slice(0, 3).join(' ');
  const page = search?.query?.search?.find((p) => normalise(p.title).includes(wanted));
  if (!page) return null;

  const extract = await getJson<{ query?: { pages?: Record<string, { extract?: string }> } }>(
    `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query', prop: 'extracts', explaintext: '1', format: 'json', redirects: '1', titles: page.title,
    })}`,
  );
  const text = Object.values(extract?.query?.pages ?? {})[0]?.extract ?? '';
  // Drop the reference sections at the end.
  const body = text.split(/\n==+ ?(See also|References|Notes|Further reading|External links|Bibliography) ?==+/)[0].trim();
  if (body.length < 300) return null;
  return {
    text: body.slice(0, MAX_SUMMARY_CHARS),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  };
}

async function openLibraryDescription(key: string): Promise<string | null> {
  const work = await getJson<{ description?: string | { value?: string } }>(`https://openlibrary.org${key}.json`);
  const d = work?.description;
  const text = typeof d === 'string' ? d : d?.value;
  return text && text.length >= 200 ? text.slice(0, MAX_SUMMARY_CHARS) : null;
}

export async function findBookSummaries(topic: string, limit: number): Promise<BookSummary[]> {
  const search = await getJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?${new URLSearchParams({
      q: topic, fields: 'key,title,author_name,edition_count,first_publish_year,subject', limit: '50',
    })}`,
  );
  // Most relevant 50, kept only if the topic shows up in the title or subjects,
  // then ranked by how many editions were published (a popularity signal).
  const keywords = normalise(topic).split(' ').filter((w) => w.length > 3);
  const about = (d: OpenLibraryDoc) => {
    const haystack = normalise(`${d.title} ${(d.subject ?? []).join(' ')}`);
    return keywords.length === 0 || keywords.some((w) => haystack.includes(w.replace(/s$/, '')));
  };
  // Same book, different printings: keep the most-published one.
  const seen = new Set<string>();
  const candidates = (search?.docs ?? [])
    .filter((d) => (d.edition_count ?? 0) >= MIN_EDITIONS && d.author_name?.length && about(d))
    .sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0))
    .filter((d) => {
      const id = `${normalise(d.title).replace(/^(the|a|an) /, '').split(' ').slice(0, 4).join(' ')}|${normalise(d.author_name?.[0] ?? '')}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit * 2);

  const books: BookSummary[] = [];
  for (const doc of candidates) {
    if (books.length >= limit) break;
    const author = doc.author_name?.[0] ?? 'Unknown';
    const wiki = await wikipediaSummary(doc.title, author);
    const summary = wiki?.text ?? (await openLibraryDescription(doc.key));
    if (!summary) continue;
    books.push({
      title: doc.title,
      author,
      year: doc.first_publish_year ?? null,
      editions: doc.edition_count ?? 0,
      summary,
      url: wiki?.url ?? `https://openlibrary.org${doc.key}`,
      license: wiki ? 'Wikipedia, CC BY-SA 4.0' : 'Open Library',
    });
  }
  return books;
}
