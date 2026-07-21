import { chromium } from 'playwright';
import { SCRAPER_CONFIG } from '../config/scraper';

export async function scrapeThreadsTrends() {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: SCRAPER_CONFIG.userAgent,
            locale: SCRAPER_CONFIG.locale
        });
        const page = await context.newPage();
        
        await page.goto(SCRAPER_CONFIG.threadsSearchUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: SCRAPER_CONFIG.timeoutMs 
        });
        
        await page.waitForTimeout(SCRAPER_CONFIG.waitAfterLoadMs);
        
        const systemWords = SCRAPER_CONFIG.systemWords;
        
        const threadsTrends = await page.evaluate((words) => {
            const results: { title: string; url: string; image: string | null; content: string | null; source: string }[] = [];
            const elements = Array.from(document.querySelectorAll('a, div[role="link"]'));
            
            elements.forEach((el) => {
                const text = el.textContent?.trim();
                if (text && text.length > 2 && text.length < 50) {
                    const cleanText = text.replace(/^[#0-9\s]+/, '').trim();
                    const lowerText = cleanText.toLowerCase();
                      
                    if (
                        cleanText &&
                        !words.some(word => lowerText === word || lowerText.startsWith(word)) &&
                        !results.some(r => r.title.toLowerCase() === lowerText)
                    ) {
                        results.push({
                            title: cleanText,
                            url: 'https://www.threads.net/search?q=' + encodeURIComponent(cleanText),
                            image: null,
                            content: null,
                            source: 'Threads'
                          });
                      }
                  }
              });
              
              return results.slice(0, 10);
          }, systemWords);

          await browser.close();
          return threadsTrends;
      } catch (error) {
          if (browser) await browser.close();
          throw error;
      }
}
