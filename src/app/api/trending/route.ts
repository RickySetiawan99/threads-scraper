import { NextResponse } from 'next/server';
import { scrapeThreadsTrends } from '@/services/threads.service';
import { fetchGoogleNewsTrends } from '@/services/news.service';

export async function GET() {
    try {
        const threadsTrends = await scrapeThreadsTrends();
        
        if (threadsTrends && threadsTrends.length > 0) {
            return NextResponse.json({
                status: 'success',
                source: 'Threads Scraper',
                data: threadsTrends
            });
        }
        
        const fallbackTrends = await fetchGoogleNewsTrends();
        return NextResponse.json({
            status: 'success',
            source: 'Google News (IT/AI)',
            data: fallbackTrends
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Scraping error, attempting fallback:', error);
        const fallbackTrends = await fetchGoogleNewsTrends();
        
        if (fallbackTrends.length > 0) {
            return NextResponse.json({
                status: 'success',
                source: 'Google News (IT/AI) - Scraper Error',
                data: fallbackTrends,
                error: errorMessage
            });
        }
        
        return NextResponse.json({
            status: 'error',
            message: errorMessage
        }, { status: 500 });
    }
}
