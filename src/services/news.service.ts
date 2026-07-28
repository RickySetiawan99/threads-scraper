import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  realUrl: string | null; // Extracted from RSS description/source
  sourceName: string;
  sourceBaseUrl: string | null;
}

/**
 * Decode Google News base64 article token (CBMi...) to extract the exact real publisher URL directly.
 */
function extractUrlFromGoogleNewsToken(googleNewsUrl: string): string | null {
  try {
    const match = googleNewsUrl.match(/articles\/([A-Za-z0-9\-_=]+)/) || googleNewsUrl.match(/read\/([A-Za-z0-9\-_=]+)/);
    if (!match) return null;

    const token = match[1];
    // Normalize base64url string
    let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const decodedBuffer = Buffer.from(base64, 'base64');
    const decodedStr = decodedBuffer.toString('latin1');

    // Extract http(s) URL inside the protobuf string
    const urlMatch = decodedStr.match(/(https?:\/\/[^\s\x00-\x1f\x7f-\xff"<>]+)/);
    if (urlMatch && urlMatch[1]) {
      let cleanUrl = urlMatch[1];
      // Clean any trailing non-URL ASCII or protobuf control chars
      cleanUrl = cleanUrl.replace(/[\x00-\x20\x7f-\xff]+.*$/, '');
      cleanUrl = cleanUrl.replace(/[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/, '');

      if (cleanUrl.startsWith('http') && !cleanUrl.includes('google.com')) {
        return cleanUrl;
      }
    }
  } catch (err) {}
  return null;
}

/**
 * Resolve a Google News redirect URL to the real publisher URL.
 */
async function resolveGoogleNewsUrl(item: RawNewsItem): Promise<string> {
  // 1. Try decoding the base64 Google News token (Fastest & most accurate!)
  const decodedUrl = extractUrlFromGoogleNewsToken(item.googleNewsUrl);
  if (decodedUrl) {
    return decodedUrl;
  }

  // 2. Try URL extracted from RSS description tag
  if (item.realUrl && !item.realUrl.includes('google.com')) {
    return item.realUrl;
  }

  // 3. Try HTTP redirect follow
  try {
    const res = await fetch(item.googleNewsUrl, {
      headers: {
        'User-Agent': SCRAPER_CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });

    if (res.url && !res.url.includes('google.com') && !res.url.includes('consent.google')) {
      return res.url;
    }

    const html = await res.text();
    const dataNauMatch = html.match(/data-n-au="(https?:\/\/[^"]+)"/);
    if (dataNauMatch && dataNauMatch[1]) {
      return dataNauMatch[1];
    }

    const hrefMatch = html.match(/href="(https?:\/\/(?!(?:.*google\.com|.*gstatic\.com|.*googleapis\.com))[^"]+)"/);
    if (hrefMatch && hrefMatch[1]) {
      return hrefMatch[1];
    }
  } catch {}

  return item.googleNewsUrl;
}

/**
 * Extract the UNIQUE og:image from the specific article page using pure HTTP fetch.
 */
async function fetchOgImage(url: string): Promise<string | null> {
  if (!url || url.includes('google.com')) return null;

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

    // Try meta patterns for og:image, twitter:image
    const patterns = [
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image)["']/i,
      /<meta[^>]+(?:property|name)=["'](?:thumbnail|image)["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let imageUrl = match[1].replace(/&amp;/g, '&').trim();

        // Skip generic logos, favicons, or google placeholders
        const lowerImg = imageUrl.toLowerCase();
        if (
          lowerImg.includes('googleusercontent.com') ||
          lowerImg.includes('gstatic.com') ||
          lowerImg.includes('favicon') ||
          lowerImg.includes('default-logo') ||
          lowerImg.includes('site-logo') ||
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
  _browserInstance?: any
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

          // Extract real URL from <description> if present
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

    console.log(`[Google News] 2. Mengambil GAMBAR UNIK Spesifik dari Portal Berita (${topItems.length} artikel)...`);

    // Process in batches of 10 concurrent HTTP requests
    const BATCH_SIZE = 10;
    const results: Array<{ title: string; url: string; image: string; content: string; source: string }> = [];

    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      const batch = topItems.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const index = i + batchIdx + 1;

          // 1. Resolve Google News redirect to real specific article URL
          const realUrl = await resolveGoogleNewsUrl(item);

          // 2. Fetch specific article's og:image (NO generic homepage fallback!)
          let realOgImage: string | null = null;
          if (realUrl && !realUrl.includes('google.com')) {
            realOgImage = await fetchOgImage(realUrl);
          }

          if (realOgImage) {
            console.log(`[Google News] [${index}/${topItems.length}] ✅ GAMBAR ARTIKEL UNIK (${item.sourceName}): ${realOgImage.substring(0, 70)}`);
          } else {
            console.log(`[Google News] [${index}/${topItems.length}] ⚠️ Artikel tidak memiliki og:image khusus (${item.sourceName})`);
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
    console.log(`[Google News] Selesai! ${realCount}/${results.length} artikel mendapatkan GAMBAR ARTIKEL UNIK.`);

    return results;
  } catch (e) {
    console.error('[Google News] Error:', e);
    return [];
  }
}
