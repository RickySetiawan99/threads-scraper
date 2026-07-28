import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Worker, Job } from 'bullmq';
import { redisConnection, WEBHOOK_SECRET } from './config/redis';
import { ScrapeJobPayload, WebhookPayload, ScrapedArticle } from './types/queue';
import { scrapeThreadsWithPool } from './services/threads.service';
import { fetchGoogleNewsTrends } from './services/news.service';
import { sendWebhookPayload } from './utils/webhook';

let browserInstance: any = null;

async function getBrowser(): Promise<any> {
  if (!browserInstance || !browserInstance.isConnected()) {
    try {
      console.log('[Worker] Launching single Chromium browser instance for context pooling...');
      const { chromium } = await import('playwright');
      browserInstance = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
      });
    } catch (err: any) {
      console.warn('[Worker] Playwright browser is not available in this environment:', err?.message || err);
      return null;
    }
  }
  return browserInstance;
}

export const worker = new Worker<ScrapeJobPayload>(
  'threads-scraper-queue',
  async (job: Job<ScrapeJobPayload>) => {
    const targetLimit = job.data.depth || 10;
    const sourceChoice = job.data.source || 'threads';

    console.log(
      `[Worker] Processing Job ID: ${job.data.jobId} - Topic: "${job.data.topic}" - Source: [${sourceChoice}] - Target: ${targetLimit} items`
    );

    let articles: ScrapedArticle[] = [];

    try {
      if (sourceChoice === 'google-news') {
        // Strictly fetch ONLY from Google News RSS
        const browser = await getBrowser();
        articles = await fetchGoogleNewsTrends(job.data.topic, targetLimit, browser);
      } else {
        // Strictly fetch ONLY from Threads.net via Playwright
        const browser = await getBrowser();
        if (!browser) {
          throw new Error('Playwright Chromium is not available in this server container environment.');
        }
        articles = await scrapeThreadsWithPool(browser, job.data.topic, targetLimit);
      }

      const payload: WebhookPayload = {
        jobId: job.data.jobId,
        status: 'success',
        topic: job.data.topic,
        timestamp: new Date().toISOString(),
        data: articles,
      };

      if (job.data.callbackUrl) {
        console.log(`[Worker] Dispatching Webhook payload (${articles.length} items from ${sourceChoice}) to: ${job.data.callbackUrl}`);
        await sendWebhookPayload(job.data.callbackUrl, WEBHOOK_SECRET, payload);
      }

      return payload;
    } catch (error: any) {
      console.error(`[Worker] Error processing job ${job.data.jobId}:`, error.message);

      const failedPayload: WebhookPayload = {
        jobId: job.data.jobId,
        status: 'failed',
        topic: job.data.topic,
        timestamp: new Date().toISOString(),
        error: error.message,
        data: [],
      };

      if (job.data.callbackUrl) {
        await sendWebhookPayload(job.data.callbackUrl, WEBHOOK_SECRET, failedPayload);
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    lockDuration: 300000, // 5 minutes lock for image resolution via Playwright
    stalledInterval: 300000,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

worker.on('error', (err) => {
  // Gracefully handle lock renewal / redis flush error logs
  if (err.message.includes('could not renew lock')) {
    console.log('[Worker] Job lock expired or queue was flushed.');
  } else {
    console.error('[Worker Error]:', err.message);
  }
});

process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down worker and browser...');
  if (browserInstance) await browserInstance.close();
  await worker.close();
  process.exit(0);
});
