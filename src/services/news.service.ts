import { chromium, Route, Browser } from 'playwright';
import { SCRAPER_CONFIG } from '../config/scraper';
import { cleanArticleTitle } from '../utils/html';

export async function resolveGoogleNewsUrlAndImage(browser: any, googleNewsUrl: string): Promise<{ finalUrl: string; ogImage: string | null; content: string | null }> {
    let page;
    try {
        const context = await browser.newContext({
            userAgent: SCRAPER_CONFIG.userAgent,
            locale: SCRAPER_CONFIG.locale
        });
        page = await context.newPage();
        
        // Block images, stylesheets and media files to speed up redirect resolution
        await page.route('**/*', (route: Route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'media', 'font'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // Navigate to the Google News URL
        await page.goto(googleNewsUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // Poll until URL redirects away from news.google.com or timeout (max 5 seconds)
        let attempts = 0;
        while (page.url().includes('news.google.com') && attempts < 10) {
            await page.waitForTimeout(500);
            attempts++;
        }

        const finalUrl = page.url();
        
        // Extract og:image and text content from the resolved page
        const result = await page.evaluate(() => {
            const getMeta = (prop: string) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content') || null;
            const ogImage = getMeta('og:image') || getMeta('twitter:image') || getMeta('thumbnail');
            
            // Extract body paragraphs (p tags)
            const paragraphs = Array.from(document.querySelectorAll('article p, main p, div[class*="content"] p, div[class*="body"] p, p'));
            const content = paragraphs
                .map(p => p.textContent?.trim())
                .filter(text => text && text.length > 40)
                .slice(0, 10)
                .join('\n\n');
                
            return { ogImage, content };
        });

        await page.close();
        return { finalUrl, ogImage: result.ogImage, content: result.content };
    } catch (e) {
        console.error('Error resolving Google News redirect URL:', e);
        if (page) {
            try { await page.close(); } catch (err) {}
        }
        return { finalUrl: googleNewsUrl, ogImage: null, content: null };
    }
}

export async function fetchGoogleNewsTrends(query?: string) {
    let browser: Browser | undefined;
    try {
        const searchQuery = query || SCRAPER_CONFIG.defaultFallbackQuery;
        const url = SCRAPER_CONFIG.googleNewsRssUrl(encodeURIComponent(searchQuery));
        
        const res = await fetch(url, {
            headers: { 'User-Agent': SCRAPER_CONFIG.userAgent }
        });
        const text = await res.text();
        const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        if (items.length === 0) {
            return [];
        }

        // Launch chromium browser instance to resolve redirects
        browser = await chromium.launch({ headless: true });
        
        // Take top 5 items to keep it extremely fast and responsive
        const topItems = items.slice(0, 5);
        
        const detailPromises = topItems.map(async (item) => {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            
            const rawTitle = titleMatch ? titleMatch[1] : '';
            const title = cleanArticleTitle(rawTitle);
            
            const googleNewsUrl = linkMatch ? linkMatch[1] : '';
            const { finalUrl, ogImage, content } = await resolveGoogleNewsUrlAndImage(browser, googleNewsUrl);
            
            return {
                title,
                url: finalUrl,
                image: ogImage,
                content,
                source: 'Google News (IT/AI)'
            };
        });
        
        const trends = await Promise.all(detailPromises);
        await browser.close();
        return trends.filter(t => t.title !== '');
    } catch (e) {
        console.error('Error fetching Google News fallback trends:', e);
        if (browser) await browser.close();
        return [];
    }
}
