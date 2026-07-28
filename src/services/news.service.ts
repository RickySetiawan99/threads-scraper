import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  sourceName: string;
}

/**
 * Resolve a Google News redirect URL to the real publisher URL using HTTP fetch (no browser needed).
 */
async function resolveGoogleNewsUrl(googleNewsUrl: string): Promise<string> {
  try {
    const res = await fetch(googleNewsUrl, {
      headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    // After following redirects, res.url should be the real publisher URL
    if (res.url && !res.url.includes('consent.google.com')) {
      return res.url;
    }
    // Fallback: parse the HTML for a redirect link
    const html = await res.text();
    const linkMatch = html.match(/href="(https?:\/\/(?!.*google\.com)[^"]+)"/);
    if (linkMatch && linkMatch[1]) {
      return linkMatch[1];
    }
  } catch {}
  return googleNewsUrl;
}

/**
 * Extract og:image from a publisher page using pure HTTP fetch (no browser needed).
 */
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
      signal: AbortSignal.timeout(4000),
    });
    const html = await res.text();

    // Try og:image, twitter:image, thumbnail
    const ogMatch =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);

    if (ogMatch && ogMatch[1]) {
      let imageUrl = ogMatch[1];

      // Skip Google/favicon/logo images
      if (
        imageUrl.includes('googleusercontent.com') ||
        imageUrl.includes('gstatic.com') ||
        imageUrl.includes('favicon') ||
        imageUrl.includes('logo')
      ) {
        return null;
      }

      // Normalize relative URLs to absolute
      if (!imageUrl.startsWith('http')) {
        try {
          const base = new URL(url);
          imageUrl = new URL(imageUrl, base.origin).toString();
        } catch {}
      }

      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
    }
  } catch {}
  return null;
}

export async function fetchGoogleNewsTrends(
  query?: string,
  limit: number = 10,
  _browserInstance?: any // kept for backward compatibility, but no longer used
) {
  try {
    const searchQuery = query || SCRAPER_CONFIG.defaultFallbackQuery;

    const subQueries =
      limit > 15
        ? [
            searchQuery,
            `${searchQuery} berita`,
            `${searchQuery} update`,
            `${searchQuery} teknologi`,
            `${searchQuery} 2026`,
            `${searchQuery} tren`,
            `${searchQuery} terbaru`,
          ]
        : [searchQuery];

    const rawItems: RawNewsItem[] = [];
    const seenTitles = new Set<string>();

    console.log(`[Google News] 1. Mengambil RSS Feed Google News...`);

    for (const q of subQueries) {
      if (rawItems.length >= limit * 1.5) break;

      try {
        const url = SCRAPER_CONFIG.googleNewsRssUrl(encodeURIComponent(q));
        const res = await fetch(url, { headers: { 'User-Agent': SCRAPER_CONFIG.userAgent } });
        const text = await res.text();
        const matches = text.match(/<item>[\s\S]*?<\/item>/g) || [];

        for (const item of matches) {
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/i);

          const rawTitle = titleMatch ? titleMatch[1] : '';
          const title = cleanArticleTitle(rawTitle);
          const googleNewsUrl = linkMatch ? linkMatch[1] : '';
          const sourceName = sourceMatch ? sourceMatch[1].trim() : 'Google News';

          if (title && googleNewsUrl && !seenTitles.has(title.toLowerCase())) {
            seenTitles.add(title.toLowerCase());
            rawItems.push({ title, googleNewsUrl, sourceName });
          }
        }
      } catch (err) {
        console.error(`[Google News] RSS error "${q}":`, err);
      }
    }

    if (rawItems.length === 0) return [];
    const topItems = rawItems.slice(0, limit);

    console.log(`[Google News] 2. Mengambil GAMBAR ASLI dari Portal Berita (${topItems.length} artikel) via HTTP...`);

    // Process in batches of 10 concurrent HTTP requests
    const BATCH_SIZE = 10;
    const results: Array<{ title: string; url: string; image: string; content: string; source: string }> = [];

    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      const batch = topItems.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const index = i + batchIdx + 1;

          // 1. Resolve Google News redirect to real publisher URL
          const realUrl = await resolveGoogleNewsUrl(item.googleNewsUrl);

          // 2. Fetch og:image from publisher page
          let realOgImage: string | null = null;
          if (realUrl && !realUrl.includes('google.com')) {
            realOgImage = await fetchOgImage(realUrl);
          }

          if (realOgImage) {
            console.log(`[Google News] [${index}/${topItems.length}] Berhasil Ambil GAMBAR ASLI (${item.sourceName})`);
          } else {
            console.log(`[Google News] [${index}/${topItems.length}] Situs tidak punya og:image (${item.sourceName})`);
          }

          return {
            title: item.title,
            url: realUrl,
            image: realOgImage || '',
            content: `Berita terbaru mengenai "${item.title}" dari publikasi ${item.sourceName}. Klik "View Source" untuk membaca artikel selengkapnya.`,
            source: item.sourceName ? `Google News (${item.sourceName})` : 'Google News',
          };
        })
      );

      results.push(...batchResults);
    }

    const realCount = results.filter((r) => Boolean(r.image)).length;
    console.log(`[Google News] Selesai! ${realCount}/${results.length} artikel mendapatkan GAMBAR ASLI penerbit.`);

    return results;
  } catch (e) {
    console.error('[Google News] Error:', e);
    return [];
  }
}
