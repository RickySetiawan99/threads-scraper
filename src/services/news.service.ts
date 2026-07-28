import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  realUrl: string | null; // Extracted from RSS description/source
  sourceName: string;
  sourceBaseUrl: string | null; // Publisher domain from <source url="...">
}

/**
 * Resolve a Google News redirect URL to the real publisher URL.
 * Strategy:
 *   1. If we already have a realUrl from RSS parsing, use that
 *   2. Try HTTP fetch with redirect follow
 *   3. Try parsing the Google News redirect page HTML
 *   4. Fallback to the google news URL itself
 */
async function resolveGoogleNewsUrl(item: RawNewsItem): Promise<string> {
  // 1. Best case: we already extracted the real URL from RSS
  if (item.realUrl && !item.realUrl.includes('google.com')) {
    return item.realUrl;
  }

  // 2. Try HTTP redirect follow
  try {
    const res = await fetch(item.googleNewsUrl, {
      headers: {
        'User-Agent': SCRAPER_CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });

    // Check if redirect landed on a non-Google URL
    if (res.url && !res.url.includes('google.com') && !res.url.includes('consent.google')) {
      return res.url;
    }

    // 3. Parse the Google redirect page HTML for embedded publisher URLs
    const html = await res.text();

    // Look for data-n-au attribute (Google News article URL)
    const dataNauMatch = html.match(/data-n-au="(https?:\/\/[^"]+)"/);
    if (dataNauMatch && dataNauMatch[1]) {
      return dataNauMatch[1];
    }

    // Look for any non-Google href
    const hrefMatch = html.match(/href="(https?:\/\/(?!(?:.*google\.com|.*gstatic\.com|.*googleapis\.com))[^"]+)"/);
    if (hrefMatch && hrefMatch[1]) {
      return hrefMatch[1];
    }

    // Look for jsaction/jsdata containing URLs
    const jsMatch = html.match(/(https?:\/\/(?!(?:.*google\.com|.*gstatic\.com))[a-zA-Z0-9._\-\/:%?=&#]+)/);
    if (jsMatch && jsMatch[1] && jsMatch[1].length > 20) {
      return jsMatch[1];
    }
  } catch {}

  // 4. Fallback: return the Google News URL
  return item.googleNewsUrl;
}

/**
 * Extract og:image from a publisher page using pure HTTP fetch (no browser needed).
 */
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SCRAPER_CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    // Try multiple meta tag patterns for og:image, twitter:image
    const patterns = [
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image)["']/i,
      /<meta[^>]+(?:property|name)=["'](?:thumbnail|image)["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let imageUrl = match[1];

        // Decode HTML entities
        imageUrl = imageUrl.replace(/&amp;/g, '&');

        // Skip unwanted images
        if (
          imageUrl.includes('googleusercontent.com') ||
          imageUrl.includes('gstatic.com') ||
          imageUrl.includes('favicon') ||
          imageUrl.toLowerCase().includes('logo') ||
          imageUrl.length < 10
        ) {
          continue;
        }

        // Normalize relative URLs to absolute
        if (!imageUrl.startsWith('http')) {
          try {
            const base = new URL(url);
            imageUrl = new URL(imageUrl, base.origin).toString();
          } catch {
            continue;
          }
        }

        if (imageUrl.startsWith('http')) {
          return imageUrl;
        }
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
          const sourceUrlMatch = item.match(/<source[^>]+url=["']([^"']+)["']/i);
          
          // Extract real URL from <description> which often contains <a href="...">
          const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
          let realUrlFromDesc: string | null = null;
          if (descMatch && descMatch[1]) {
            const descHrefMatch = descMatch[1].match(/href=["'](https?:\/\/(?!.*google\.com)[^"']+)["']/);
            if (descHrefMatch && descHrefMatch[1]) {
              realUrlFromDesc = descHrefMatch[1].replace(/&amp;/g, '&');
            }
          }

          const rawTitle = titleMatch ? titleMatch[1] : '';
          const title = cleanArticleTitle(rawTitle);
          const googleNewsUrl = linkMatch ? linkMatch[1] : '';
          const sourceName = sourceMatch ? sourceMatch[1].trim() : 'Google News';
          const sourceBaseUrl = sourceUrlMatch ? sourceUrlMatch[1] : null;

          if (title && googleNewsUrl && !seenTitles.has(title.toLowerCase())) {
            seenTitles.add(title.toLowerCase());
            rawItems.push({
              title,
              googleNewsUrl,
              realUrl: realUrlFromDesc,
              sourceName,
              sourceBaseUrl,
            });
          }
        }
      } catch (err) {
        console.error(`[Google News] RSS error "${q}":`, err);
      }
    }

    if (rawItems.length === 0) return [];
    const topItems = rawItems.slice(0, limit);

    console.log(`[Google News] 2. Mengambil GAMBAR ASLI dari Portal Berita (${topItems.length} artikel) via HTTP...`);

    // Process in batches of 8 concurrent HTTP requests
    const BATCH_SIZE = 8;
    const results: Array<{ title: string; url: string; image: string; content: string; source: string }> = [];

    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      const batch = topItems.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const index = i + batchIdx + 1;

          // 1. Resolve Google News redirect to real publisher URL
          const realUrl = await resolveGoogleNewsUrl(item);

          // 2. Fetch og:image from publisher page
          let realOgImage: string | null = null;
          if (realUrl && !realUrl.includes('news.google.com')) {
            realOgImage = await fetchOgImage(realUrl);
          }

          // 3. Fallback: try fetching from publisher base domain homepage
          if (!realOgImage && item.sourceBaseUrl) {
            try {
              // Try fetching the homepage for a generic publisher image
              const homepageUrl = item.sourceBaseUrl.endsWith('/') ? item.sourceBaseUrl : `${item.sourceBaseUrl}/`;
              realOgImage = await fetchOgImage(homepageUrl);
            } catch {}
          }

          if (realOgImage) {
            console.log(`[Google News] [${index}/${topItems.length}] ✅ GAMBAR ASLI (${item.sourceName}) - ${realUrl.substring(0, 60)}`);
          } else {
            console.log(`[Google News] [${index}/${topItems.length}] ⚠️ No og:image (${item.sourceName}) - ${realUrl.substring(0, 60)}`);
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
