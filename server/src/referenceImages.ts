// Finds openly licensed reference images on Openverse (openverse.org) for bots
// created without uploads. Only images licensed for commercial use and
// modification are used, and each keeps its creator, license and source for credit.

const SEARCH_URL = 'https://api.openverse.org/v1/images/';
const USER_AGENT = 'Twinfluencer/0.1 (reference image lookup)';
const TIMEOUT_MS = 6000;
const MAX_BYTES = 2 * 1024 * 1024;

export type ReferenceImage = {
  filename: string;
  data: Buffer;
  sourceUrl: string;
  creator: string;
  license: string;
};

type OpenverseResult = {
  id: string;
  title?: string | null;
  creator?: string | null;
  license: string;
  license_version?: string | null;
  thumbnail?: string | null;
  foreign_landing_url?: string | null;
};

// Returns what it could get: an empty list if Openverse is down or slow, so
// creating a bot never fails because of it.
export async function findReferenceImages(query: string, count: number): Promise<ReferenceImage[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(count * 2), // spares, in case some downloads fail
    license_type: 'commercial,modification',
    mature: 'false',
  });

  let results: OpenverseResult[];
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: OpenverseResult[] };
    results = body.results ?? [];
  } catch {
    return [];
  }

  const downloads = await Promise.all(
    results.filter((r) => r.thumbnail).map(async (r): Promise<ReferenceImage | null> => {
      try {
        const res = await fetch(r.thumbnail as string, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length === 0 || data.length > MAX_BYTES) return null;
        const license = `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`
          .replace('CC CC0', 'CC0')
          .replace('CC PDM', 'Public domain');
        return {
          filename: (r.title || query).slice(0, 200),
          data,
          sourceUrl: r.foreign_landing_url || `https://openverse.org/image/${r.id}`,
          creator: (r.creator || 'Unknown').slice(0, 200),
          license,
        };
      } catch {
        return null;
      }
    }),
  );

  return downloads.filter((d): d is ReferenceImage => d !== null).slice(0, count);
}
