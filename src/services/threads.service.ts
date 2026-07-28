import type { Browser } from 'playwright';
import { SCRAPER_CONFIG } from '../config/scraper';
import { ScrapedArticle } from '../types/queue';

async function scrapeSingleThreadsPage(
  page: any,
  searchQuery: string,
  targetLimit: number,
  existingResults: ScrapedArticle[]
): Promise<ScrapedArticle[]> {
  const targetUrl = `${SCRAPER_CONFIG.threadsSearchUrl}?q=${encodeURIComponent(searchQuery)}`;

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_CONFIG.timeoutMs,
    });

    await page.waitForTimeout(2000);

    // Scroll down to load extra items
    const scrollSteps = Math.min(10, Math.ceil(targetLimit / 5));
    for (let i = 0; i < scrollSteps; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(400);
    }

    // Parse Threads cards
    const rawItems = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[data-pressable-container="true"]'));

      return cards
        .map((card: any) => {
          const textEl = card.querySelector('div[dir="auto"]');
          const titleText = textEl ? textEl.textContent?.trim() : '';

          const linkEl = card.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
          const postUrl = linkEl ? linkEl.href : '';

          const imgEl = card.querySelector('img[src*="cdninstagram.com"]') as HTMLImageElement | null;
          const imageUrl = imgEl ? imgEl.src : null;

          return {
            title: titleText || '',
            url: postUrl || '',
            image: imageUrl || null,
            source: 'Threads',
          };
        })
        .filter((item: any) => item.title.length > 5 && item.url.length > 0);
    });

    const merged = [...existingResults];
    for (const item of rawItems) {
      if (merged.length >= targetLimit) break;
      const isDuplicate = merged.some(
        (existing) => existing.url === item.url || existing.title.toLowerCase() === item.title.toLowerCase()
      );
      if (!isDuplicate) {
        merged.push({
          title: item.title,
          url: item.url,
          image: item.image,
          content: item.title,
          source: 'Threads',
        });
      }
    }

    return merged;
  } catch (err) {
    console.error(`Error scraping Threads for query "${searchQuery}":`, err);
    return existingResults;
  }
}

export async function scrapeThreadsWithPool(
  browser: any,
  query?: string,
  limit: number = 10
): Promise<ScrapedArticle[]> {
  const context = await browser.newContext({
    userAgent: SCRAPER_CONFIG.userAgent,
    locale: SCRAPER_CONFIG.locale,
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Keep CSS for IntersectionObserver layout, block images/media
    await page.route('**/*.{png,jpg,jpeg,svg,gif,webp,woff,woff2,ttf,mp4,analytics*}', (route: any) =>
      route.abort()
    );

    const mainQuery = query || SCRAPER_CONFIG.defaultFallbackQuery;
    const cleanTag = mainQuery.replace(/[^a-zA-Z0-9]/g, '');

    // Multi-Keyword Expansion for Threads to bypass guest pagination caps & reach 100+ items
    const subQueries = limit > 15
      ? [
          mainQuery,
          `#${cleanTag}`,
          `${mainQuery} news`,
          `${mainQuery} update`,
          `${mainQuery} trend`,
          `${mainQuery} tech`,
          `${mainQuery} viral`,
          `${mainQuery} indonesia`,
        ]
      : [mainQuery];

    let accumulatedResults: ScrapedArticle[] = [];

    for (const subQ of subQueries) {
      if (accumulatedResults.length >= limit) break;
      accumulatedResults = await scrapeSingleThreadsPage(page, subQ, limit, accumulatedResults);
    }

    return accumulatedResults.slice(0, limit);
  } finally {
    await context.close();
  }
}

export async function scrapeThreadsTrends(limit: number = 10): Promise<ScrapedArticle[]> {
  let browser: any;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    });
    return await scrapeThreadsWithPool(browser, undefined, limit);
  } finally {
    if (browser) await browser.close();
  }
}
