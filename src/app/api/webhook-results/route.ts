import { NextResponse } from 'next/server';
import { getWebhookEvents } from '@/lib/webhookStore';

export async function GET() {
  const events = getWebhookEvents();
  return NextResponse.json({
    status: 'success',
    totalEvents: events.length,
    events,
  });
}
