import { ScrapedArticle } from '@/types/queue';

export interface WebhookEvent {
  jobId: string;
  topic: string;
  status: string;
  timestamp: string;
  articlesCount: number;
  data: ScrapedArticle[];
}

// In-memory store for Webhook events received by the Next.js local receiver
let globalWebhookStore: WebhookEvent[] = [];

export function getWebhookEvents(): WebhookEvent[] {
  return globalWebhookStore;
}

export function addWebhookEvent(event: WebhookEvent) {
  globalWebhookStore.unshift(event);
  if (globalWebhookStore.length > 50) {
    globalWebhookStore.pop();
  }
}

export function clearWebhookEvents() {
  globalWebhookStore = [];
}
