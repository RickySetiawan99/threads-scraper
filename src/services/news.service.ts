import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  realUrl: string | null;
  rssImage: string | null;
  sourceName: string;
  sourceBaseUrl: string | null;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const JUDOL_SPAM_KEYWORDS = [
  'slot', 'gacor', 'judol', 'judi', 'poker', 'casino', 'togel', 'maxwin',
  'pragmatic', 'zeus', 'sbobet', 'rtp', 'jackpot', 'bet88', 'slot88',
  'judionline', 'judi online', 'bandar judi', 'taruhan online', 'scatter',
  'olympus', 'mahjong', 'spadegaming', 'habanero', 'microgaming',
  'bocoran slot', 'link gacor', 'situs judi', 'situs slot', 'agen judi',
  'agen slot', 'game slot', 'judi bola', 'depo pulsa', 'tanpa potongan',
  'bocoran rtp', 'mudah menang', 'pasti jp', 'sensasional', 'bonus 100'
];

export function isJudolOrSpam(text?: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return JUDOL_SPAM_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Decode Google News article URL using Google's internal batchexecute API.
 * This is the ONLY reliable method to resolve CBMi... tokens to real publisher URLs
 * without a headless browser.
 */
async function decodeGoogleNewsUrl(googleNewsUrl: string): Promise<string | null> {
  try {
    // Step 1: Fetch the Google News article page to extract article metadata
    const pageRes = await fetch(googleNewsUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
    const html = await pageRes.text();

    const articleIdMatch = html.match(/data-n-a-id="([^"]+)"/);
    const timestampMatch = html.match(/data-n-a-ts="([^"]+)"/);
    const signatureMatch = html.match(/data-n-a-sg="([^"]+)"/);

    if (!articleIdMatch || !timestampMatch || !signatureMatch) {
      return null;
    }

    const articleId = articleIdMatch[1];
    const timestamp = timestampMatch[1];
    const signature = signatureMatch[1];

    // Step 2: Call Google's internal batchexecute API to resolve the real URL
    const innerPayload = JSON.stringify([
      "garturlreq",
      [
        ["en", "ID", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"], null, null, 1, 1, "ID:en", null, null, null, null, null, null, null, 0, 5],
        "en",
        "ID",
        true,
        [2, 4, 8],
        1,
        true,
        timestamp,
        false,
        false,
        null,
        false
      ],
      articleId,
      timestamp,
      signature
    ]);

    const outerPayload = JSON.stringify([[["Fbv4je", innerPayload, null, "generic"]]]);

    const body = new URLSearchParams();
    body.append('f.req', outerPayload);

    const batchRes = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': BROWSER_UA,
        'Referer': 'https://news.google.com/',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });

    const batchText = await batchRes.text();

    // Extract non-Google URL from response
    const urlMatch = batchText.match(
      /https?:\/\/(?!news\.google\.com|www\.google\.com|consent\.google|gstatic\.com|googleapis\.com|angular\.dev|www\.w3\.org)[^\s"\\,\]\)]+/
    );

    if (urlMatch) {
      let realUrl = urlMatch[0];
      // Decode unicode escapes
      realUrl = realUrl.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      return realUrl;
    }
  } catch (err) {}
  return null;
}

/**
 * Resolve a Google News redirect URL to the real publisher URL.
 */
async function resolveGoogleNewsUrl(item: RawNewsItem): Promise<string> {
  // 1. Best: Use batchexecute API decoder (works 100% without browser)
  const decodedUrl = await decodeGoogleNewsUrl(item.googleNewsUrl);
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
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });

    if (res.url && !res.url.includes('google.com') && !res.url.includes('consent.google')) {
      return res.url;
    }
  } catch {}

  return item.googleNewsUrl;
}

/**
 * Extract og:image or HTML inline image from a publisher page using pure HTTP fetch.
 */
async function fetchOgImage(url: string): Promise<string | null> {
  if (!url || url.includes('google.com')) return null;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();

    // 1. Try meta tags (og:image, twitter:image, thumbnail)
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
        const lowerImg = imageUrl.toLowerCase();

        if (
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
    const imgMatches = html.match(
      /<img[^>]+(?:src|data-src|data-original)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi
    );

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
      if (rawItems.length >= limit * 2) break;

      try {
        const url = SCRAPER_CONFIG.googleNewsRssUrl(encodeURIComponent(q));
        const res = await fetch(url, {
          headers: { 'User-Agent': BROWSER_UA },
        });
        const text = await res.text();
        const matches = text.match(/<item>[\s\S]*?<\/item>/g) || [];

        for (const item of matches) {
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/i);
          const sourceUrlMatch = item.match(/<source[^>]+url=["']([^"']+)["']/i);

          const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
          let realUrlFromDesc: string | null = null;
          let rssImageFromDesc: string | null = null;

          if (descMatch && descMatch[1]) {
            const descContent = descMatch[1];
            const descHrefMatch = descContent.match(
              /href=["'](https?:\/\/(?!.*google\.com)[^"']+)["']/
            );
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

          // Reject any online gambling / judol / spam content
          if (
            isJudolOrSpam(title) ||
            isJudolOrSpam(googleNewsUrl) ||
            isJudolOrSpam(sourceName) ||
            isJudolOrSpam(realUrlFromDesc)
          ) {
            console.log(`[Google News] 🚫 Judol/Spam Filtered: "${title}"`);
            continue;
          }

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

    console.log(
      `[Google News] 2. Resolving ${topItems.length} artikel via batchexecute API + mengambil gambar asli...`
    );

    // Process in batches of 5 to avoid rate-limiting on batchexecute API
    const BATCH_SIZE = 5;
    const results: Array<{
      title: string;
      url: string;
      image: string;
      content: string;
      source: string;
    }> = [];

    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      const batch = topItems.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const index = i + batchIdx + 1;

          // 1. Resolve Google News URL to real publisher article URL via batchexecute
          const realUrl = await resolveGoogleNewsUrl(item);

          // Reject if resolved URL is judol/spam
          if (isJudolOrSpam(realUrl)) {
            console.log(`[Google News] [${index}/${topItems.length}] 🚫 Judol URL Filtered: ${realUrl}`);
            return null;
          }

          // 2. Fetch og:image from real publisher page
          let realOgImage: string | null = null;
          if (realUrl && !realUrl.includes('google.com')) {
            realOgImage = await fetchOgImage(realUrl);
          }

          const finalImage = realOgImage || item.rssImage || '';

          if (realOgImage) {
            console.log(
              `[Google News] [${index}/${topItems.length}] ✅ (${item.sourceName}): ${realOgImage.substring(0, 80)}`
            );
          } else {
            console.log(
              `[Google News] [${index}/${topItems.length}] ⚠️ No image (${item.sourceName}) - URL: ${realUrl.substring(0, 60)}`
            );
          }

          return {
            title: item.title,
            url: realUrl,
            image: finalImage,
            content: `Berita terbaru mengenai "${item.title}" dari publikasi ${item.sourceName}. Klik "View Source" untuk membaca artikel selengkapnya.`,
            source: item.sourceName
              ? `Google News (${item.sourceName})`
              : 'Google News',
          };
        })
      );

      // Filter out nulls from Judol URL rejections
      const validBatch = batchResults.filter((b): b is NonNullable<typeof b> => b !== null);
      results.push(...validBatch);

      // Small delay between batches to avoid rate-limiting
      if (i + BATCH_SIZE < topItems.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const realCount = results.filter((r) => Boolean(r.image)).length;
    console.log(
      `[Google News] Selesai! ${realCount}/${results.length} artikel mendapatkan GAMBAR ASLI penerbit.`
    );

    return results;
  } catch (e) {
    console.error('[Google News] Error:', e);
    return [];
  }
}
