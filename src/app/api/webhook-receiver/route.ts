import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { addWebhookEvent } from '@/lib/webhookStore';
import { WEBHOOK_SECRET } from '@/config/redis';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('X-Scraper-Signature');

    // Validate HMAC SHA-256 signature
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(rawBody);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    if (signature && signature !== expectedSignature) {
      console.warn('[WebhookReceiver] Invalid HMAC signature provided!');
    }

    const payload = JSON.parse(rawBody);

    if (payload.status === 'success' && Array.isArray(payload.data)) {
      addWebhookEvent({
        jobId: payload.jobId || `job_${Date.now()}`,
        topic: payload.topic || 'General',
        status: payload.status,
        timestamp: payload.timestamp || new Date().toISOString(),
        articlesCount: payload.data.length,
        data: payload.data,
      });

      console.log(`[WebhookReceiver] Received ${payload.data.length} articles for Job ${payload.jobId}`);
    }

    return NextResponse.json({ status: 'success', message: 'Webhook received' }, { status: 200 });
  } catch (error: any) {
    console.error('[WebhookReceiver] Error parsing webhook payload:', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
