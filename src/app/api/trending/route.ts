import { NextResponse } from 'next/server';
import { getWebhookEvents } from '@/lib/webhookStore';
import { fetchGoogleNewsTrends } from '@/services/news.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  const source = searchParams.get('source') || 'google-news';
  const query = searchParams.get('query') || searchParams.get('topic') || undefined;

  const events = getWebhookEvents();
  const latestEvent = events.find(e => e.data && e.data.length > 0) || events[0];

  // If cached events exist and satisfy the requested limit, return them
  if (latestEvent && latestEvent.data && latestEvent.data.length >= limit) {
    const items = latestEvent.data.slice(0, limit);
    return NextResponse.json({
      status: 'success',
      source: latestEvent.topic || source,
      total: items.length,
      data: items,
    });
  }

  // Live Fallback: Fetch fresh news trends directly via news service (guarantees non-empty response)
  const articles = await fetchGoogleNewsTrends(query, limit);

  return NextResponse.json({
    status: 'success',
    source: source,
    total: articles.length,
    data: articles,
  });
}
