import { Browser, chromium } from 'playwright';
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

    const systemWords = SCRAPER_CONFIG.systemWords;

    const items = await page.evaluate(
      ({ words }: { words: string[] }) => {
        const results: { title: string; url: string; image: string | null; content: string | null; source: string }[] = [];
        
        const elements = Array.from(
          document.querySelectorAll('div[data-pressable-container="true"], a[href*="/post/"], a[href*="/@"], span[dir="auto"], div[dir="auto"]')
        );

        elements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 8 && text.length < 350) {
            const cleanText = text.replace(/^[#0-9\s]+/, '').trim();
            const lowerText = cleanText.toLowerCase();

            if (
              cleanText &&
              !words.some((word) => lowerText === word || lowerText.startsWith(word)) &&
              !results.some((r) => r.title.toLowerCase() === lowerText)
            ) {
              const href = (el as HTMLAnchorElement).href || el.closest('a')?.href;
              const postUrl = href && href.includes('threads.net') ? href : 'https://www.threads.net/search?q=' + encodeURIComponent(cleanText);

              results.push({
                title: cleanText.slice(0, 150),
                url: postUrl,
                image: null,
                content: cleanText.length > 90 ? cleanText : null,
                source: 'Threads',
              });
            }
          }
        });

        return results;
      },
      { words: systemWords }
    );

    const merged = [...existingResults];
    for (const item of items) {
      if (!merged.some((m) => m.title.toLowerCase() === item.title.toLowerCase())) {
        merged.push(item);
      }
      if (merged.length >= targetLimit) break;
    }

    return merged;
  } catch (err) {
    console.error(`Error scraping Threads for query "${searchQuery}":`, err);
    return existingResults;
  }
}

export async function scrapeThreadsWithPool(
  browser: Browser,
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
    await page.route('**/*.{png,jpg,jpeg,svg,gif,webp,woff,woff2,ttf,mp4,analytics*}', (route) =>
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
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    });
    return await scrapeThreadsWithPool(browser, undefined, limit);
  } finally {
    if (browser) await browser.close();
  }
}
