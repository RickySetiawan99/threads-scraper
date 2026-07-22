import crypto from 'crypto';
import { WebhookPayload } from '../types/queue';

export function generateHmacSignature(payloadString: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return `sha256=${hmac.digest('hex')}`;
}

export async function sendWebhookPayload(
  callbackUrl: string,
  secret: string,
  payload: WebhookPayload
): Promise<{ ok: boolean; status: number }> {
  const body = JSON.stringify(payload);
  const signature = generateHmacSignature(body, secret);

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scraper-Signature': signature,
    },
    body,
  });

  return { ok: response.ok, status: response.status };
}
