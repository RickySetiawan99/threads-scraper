import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redisConnection, getRawRedisClient } from '@/config/redis';
import { ScrapeJobPayload } from '@/types/queue';
import { clearWebhookEvents } from '@/lib/webhookStore';

let queueInstance: Queue<ScrapeJobPayload> | null = null;

function getScraperQueue(): Queue<ScrapeJobPayload> {
  if (!queueInstance) {
    queueInstance = new Queue<ScrapeJobPayload>('threads-scraper-queue', {
      connection: redisConnection,
    });
  }
  return queueInstance;
}

// POST: Enqueue Job with Deduplication & Auto-Clean Options
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic, callbackUrl, source = 'google-news', depth = 10, forceNew = false } = body;

    if (!topic || !callbackUrl) {
      return NextResponse.json(
        { error: 'Parameters "topic" and "callbackUrl" are required.' },
        { status: 400 }
      );
    }

    const cleanSource = 'google-news';
    const topicSlug = topic.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Create deterministic jobId to prevent duplicate queue stacking
    const jobId = forceNew
      ? `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      : `scrape:${cleanSource}:${topicSlug}`;

    const queue = getScraperQueue();

    // Add job to queue with deduplication & automatic retention cleanup
    const job = await queue.add(
      'scrape-task',
      {
        jobId,
        topic,
        source: cleanSource,
        depth,
        callbackUrl,
      },
      {
        jobId, // Ensures BullMQ deduplicates if same job is currently waiting/active
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 10, age: 300 }, // Auto-delete completed jobs from Redis after 5 mins
        removeOnFail: { count: 20, age: 3600 },    // Auto-delete failed jobs from Redis after 1 hour
      }
    );

    return NextResponse.json(
      {
        status: 'accepted',
        message: 'Scraping job enqueued successfully.',
        jobId: job.id || jobId,
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('Error enqueueing scrape job:', error);
    return NextResponse.json(
      { error: 'Failed to enqueue job', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Obliterate Queue & Flush All Keys via Upstash Native Redis FLUSHDB Command
export async function DELETE() {
  try {
    const queue = getScraperQueue();
    await queue.drain(true);
    await queue.obliterate({ force: true });

    // Clear local in-memory webhook event store
    clearWebhookEvents();

    // Send native FLUSHDB command directly to Upstash Redis DB per Upstash Docs
    const redisClient = getRawRedisClient();
    await redisClient.flushdb();

    return NextResponse.json({
      status: 'success',
      message: 'Upstash Redis FLUSHDB executed successfully. Storage reset to 0 Bytes.',
    });
  } catch (error: any) {
    console.error('Error cleaning queue:', error);
    return NextResponse.json(
      { error: 'Failed to clean queue', details: error.message },
      { status: 500 }
    );
  }
}
