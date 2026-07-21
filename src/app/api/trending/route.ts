import { NextResponse } from 'next/server';
import { scrapeThreadsTrends } from '@/services/threads.service';
import { fetchGoogleNewsTrends } from '@/services/news.service';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : 5;

        const threadsTrends = await scrapeThreadsTrends(limit);
        
        if (threadsTrends && threadsTrends.length > 0) {
            return NextResponse.json({
                status: 'success',
                source: 'Threads Scraper',
                data: threadsTrends
            });
        }
        
        const fallbackTrends = await fetchGoogleNewsTrends(undefined, limit);
        return NextResponse.json({
            status: 'success',
            source: 'Google News (IT/AI)',
            data: fallbackTrends
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Scraping error, attempting fallback:', error);
        
        // Pass a default limit of 5 to fallback on error
        const fallbackTrends = await fetchGoogleNewsTrends(undefined, 5);
        
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
