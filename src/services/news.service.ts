import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  realUrl: string | null;
  rssImage: string | null; // Extracted directly from RSS <description> <img src="...">
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
    let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const decodedBuffer = Buffer.from(base64, 'base64');
    const decodedStr = decodedBuffer.toString('latin1');

    const urlMatch = decodedStr.match(/(https?:\/\/[^\s\x00-\x1f\x7f-\xff"<>]+)/);
    if (urlMatch && urlMatch[1]) {
      let cleanUrl = urlMatch[1];
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
  // 1. Try decoding the base64 Google News token
  const decodedUrl = extractUrlFromGoogleNewsToken(item.googleNewsUrl);
  if (decodedUrl) {
    return decodedUrl;
  }

  // 2. Try URL extracted from RSS description tag
  if (item.realUrl && !item.realUrl.includes('google.com')) {
    return item.realUrl;
  }

  // 3. Try HTTP redirect follow with full browser headers
  try {
    const res = await fetch(item.googleNewsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
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
 * Extract og:image or HTML inline image from a publisher page using pure HTTP fetch with full browser headers.
 */
async function fetchOgImage(url: string): Promise<string | null> {
  if (!url || url.includes('google.com')) return null;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();

    // 1. Try meta tags (og:image, twitter:image, thumbnail)
    const patterns = [
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image|image)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image:src|twitter:image|image)["']/i,
      /<meta[^>]+(?:property|name)=["'](?:thumbnail)["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["'](?:image_src|icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let imageUrl = match[1].replace(/&amp;/g, '&').trim();
        const lowerImg = imageUrl.toLowerCase();

        if (
          lowerImg.includes('googleusercontent.com') ||
          lowerImg.includes('gstatic.com') ||
          lowerImg.includes('favicon') ||
          lowerImg.includes('default-logo') ||
          imageUrl.length < 10
        ) {
          continue;
        }

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

    // 2. Fallback: Parse <img> tags inside HTML content
    const imgMatches =
      html.match(/<img[^>]+(?:src|data-src|data-original)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi) ||
      html.match(/<img[^>]+(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi);

    if (imgMatches) {
      for (const imgTag of imgMatches) {
        const srcMatch = imgTag.match(/(?:src|data-src|data-original)=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
          let imageUrl = srcMatch[1].replace(/&amp;/g, '&').trim();
          const lowerImg = imageUrl.toLowerCase();

          if (
            !lowerImg.includes('logo') &&
            !lowerImg.includes('icon') &&
            !lowerImg.includes('avatar') &&
            !lowerImg.includes('banner') &&
            !lowerImg.includes('pixel') &&
            !lowerImg.includes('tracking') &&
            !lowerImg.includes('gstatic.com') &&
            imageUrl.length > 12
          ) {
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
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        const text = await res.text();
        const matches = text.match(/<item>[\s\S]*?<\/item>/g) || [];

        for (const item of matches) {
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/i);
          const sourceUrlMatch = item.match(/<source[^>]+url=["']([^"']+)["']/i);

          // Extract real URL and real image directly from RSS <description> tag
          const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
          let realUrlFromDesc: string | null = null;
          let rssImageFromDesc: string | null = null;

          if (descMatch && descMatch[1]) {
            const descContent = descMatch[1];
            const descHrefMatch = descContent.match(/href=["'](https?:\/\/(?!.*google\.com)[^"']+)["']/);
            if (descHrefMatch && descHrefMatch[1]) {
              realUrlFromDesc = descHrefMatch[1].replace(/&amp;/g, '&');
            }

            const descImgMatch = descContent.match(/src=["'](https?:\/\/[^"']+)["']/i);
            if (descImgMatch && descImgMatch[1]) {
              rssImageFromDesc = descImgMatch[1].replace(/&amp;/g, '&');
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
              rssImage: rssImageFromDesc,
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

    console.log(`[Google News] 2. Mengambil GAMBAR ASLI dari Portal Berita (${topItems.length} artikel)...`);

    const BATCH_SIZE = 10;
    const results: Array<{ title: string; url: string; image: string; content: string; source: string }> = [];

    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      const batch = topItems.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const index = i + batchIdx + 1;

          // 1. Resolve Google News redirect to real specific article URL
          const realUrl = await resolveGoogleNewsUrl(item);

          // 2. Fetch specific article's og:image or HTML img tag
          let realOgImage: string | null = null;
          if (realUrl && !realUrl.includes('google.com')) {
            realOgImage = await fetchOgImage(realUrl);
          }

          // 3. Fallback to image extracted from RSS description tag (if available)
          const finalImage = realOgImage || item.rssImage || '';

          if (finalImage) {
            console.log(`[Google News] [${index}/${topItems.length}] ✅ GAMBAR ASLI (${item.sourceName}): ${finalImage.substring(0, 70)}`);
          } else {
            console.log(`[Google News] [${index}/${topItems.length}] ⚠️ No image found for (${item.sourceName})`);
          }

          return {
            title: item.title,
            url: realUrl,
            image: finalImage,
            content: `Berita terbaru mengenai "${item.title}" dari publikasi ${item.sourceName}. Klik "View Source" untuk membaca artikel selengkapnya.`,
            source: item.sourceName ? `Google News (${item.sourceName})` : 'Google News',
          };
        })
      );

      results.push(...batchResults);
    }

    const realCount = results.filter((r) => Boolean(r.image)).length;
    console.log(`[Google News] Selesai! ${realCount}/${results.length} artikel mendapatkan GAMBAR ASLI.`);

    return results;
  } catch (e) {
    console.error('[Google News] Error:', e);
    return [];
  }
}
