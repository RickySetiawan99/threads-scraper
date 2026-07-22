import { NextResponse } from 'next/server';
import { getWebhookEvents } from '@/lib/webhookStore';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  const source = searchParams.get('source') || 'google-news';

  const events = getWebhookEvents();
  const latestEvent = events.find(e => e.data && e.data.length > 0) || events[0];

  if (!latestEvent) {
    return NextResponse.json({
      status: 'success',
      source,
      total: 0,
      data: [],
    });
  }

  const items = latestEvent.data.slice(0, limit);

  return NextResponse.json({
    status: 'success',
    source: latestEvent.topic || source,
    total: items.length,
    data: items,
  });
}
