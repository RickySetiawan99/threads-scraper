export interface ScrapeJobPayload {
  jobId: string;
  topic: string;
  source?: 'google-news';
  depth?: number;
  callbackUrl: string;
}

export interface ScrapedArticle {
  title: string;
  url: string;
  image: string | null;
  content: string | null;
  source: string;
}

export interface WebhookPayload {
  jobId: string;
  status: 'success' | 'failed';
  topic: string;
  timestamp: string;
  error?: string;
  data: ScrapedArticle[];
}
