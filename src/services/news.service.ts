import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

interface RawNewsItem {
  title: string;
  googleNewsUrl: string;
  sourceName: string;
}

export async function fetchGoogleNewsTrends(
  query?: string,
  limit: number = 10,
  browserInstance?: any
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

    console.log(`[Google News] 2. Mengambil GAMBAR ASLI dari Portal Berita (${topItems.length} artikel)...`);

    const results: Array<{ title: string; url: string; image: string; content: string; source: string }> = [];

    if (browserInstance) {
      const context = await browserInstance.newContext({
        userAgent: SCRAPER_CONFIG.userAgent,
        locale: 'id-ID',
      });

      const BATCH_SIZE = 10;
      for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
        const batch = topItems.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (item, batchIdx) => {
            const index = i + batchIdx + 1;
            const page = await context.newPage();
            let realUrl = item.googleNewsUrl;
            let realOgImage: string | null = null;

            try {
              // Blokir resource berat (stylesheet, media, font, image) untuk mempercepat redirect resolution
              await page.route('**/*', (route) => {
                const resourceType = route.request().resourceType();
                if (['stylesheet', 'media', 'font'].includes(resourceType)) {
                  route.abort().catch(() => {});
                } else {
                  route.continue().catch(() => {});
                }
              });

              await page.goto(item.googleNewsUrl, {
                waitUntil: 'commit',
                timeout: 4000,
              }).catch(() => {});

              let attempts = 0;
              while (page.url().includes('news.google.com') && attempts < 5) {
                await page.waitForTimeout(200);
                attempts++;
              }

              realUrl = page.url();

              // Jika masih di google news, ekstrak URL penerbit dari tag link/anchor
              if (realUrl.includes('google.com')) {
                const extracted = await page.evaluate(() => {
                  const a = document.querySelector('a[href*="http"]:not([href*="google.com"])');
                  return a?.getAttribute('href') || null;
                }).catch(() => null);
                if (extracted) realUrl = extracted;
              }

              // 2. Ekstrak meta image (og:image, twitter:image, thumbnail)
              realOgImage = await page.evaluate(() => {
                const metas = Array.from(document.querySelectorAll('meta'));
                for (const m of metas) {
                  const prop = (m.getAttribute('property') || m.getAttribute('name') || '').toLowerCase();
                  const content = m.getAttribute('content') || '';
                  if (
                    (prop.includes('og:image') || prop.includes('twitter:image') || prop.includes('thumbnail')) &&
                    content &&
                    !content.includes('googleusercontent.com') &&
                    !content.includes('gstatic.com') &&
                    !content.includes('favicon') &&
                    !content.includes('logo')
                  ) {
                    return content;
                  }
                }
                const img = document.querySelector('article img, figure img, main img');
                return img?.getAttribute('src') || img?.getAttribute('data-src') || null;
              }).catch(() => null);

              // 3. Fallback: Fast HTTP fetch jika situs belum mengembalikan og:image
              if ((!realOgImage || !realOgImage.startsWith('http')) && realUrl && !realUrl.includes('google.com')) {
                try {
                  const resp = await fetch(realUrl, {
                    headers: { 'User-Agent': SCRAPER_CONFIG.userAgent },
                    signal: AbortSignal.timeout(3000),
                  });
                  const htmlText = await resp.text();
                  const ogMatch =
                    htmlText.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["'][^>]+content=["']([^"']+)["']/i) ||
                    htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
                  if (ogMatch && ogMatch[1]) {
                    realOgImage = ogMatch[1];
                  }
                } catch {}
              }

              // Normalisasi absolute URL jika ogImage berbentuk relative path
              if (realOgImage && !realOgImage.startsWith('http')) {
                try {
                  const base = new URL(realUrl);
                  realOgImage = new URL(realOgImage, base.origin).toString();
                } catch {}
              }

              if (realOgImage && realOgImage.startsWith('http')) {
                console.log(`[Google News] [${index}/${topItems.length}] Berhasil Ambil GAMBAR ASLI (${item.sourceName})`);
              } else {
                console.log(`[Google News] [${index}/${topItems.length}] Situs tidak punya og:image (${item.sourceName})`);
              }
            } catch (err: any) {
              console.log(`[Google News] [${index}/${topItems.length}] Skips item redirect (${item.sourceName})`);
            } finally {
              await page.close().catch(() => {});
            }

            const finalImage = realOgImage && realOgImage.startsWith('http') ? realOgImage : '';

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

      await context.close().catch(() => {});
    }

    const realCount = results.filter((r) => Boolean(r.image)).length;
    console.log(`[Google News] Selesai! ${realCount}/${results.length} artikel mendapatkan GAMBAR ASLI penerbit.`);

    return results;
  } catch (e) {
    console.error('[Google News] Error:', e);
    return [];
  }
}
