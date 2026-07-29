'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Zap,
  BookOpen,
  Check,
  Copy,
  Clock,
  Cpu,
  AlertTriangle,
  Sparkles,
  Search,
  ExternalLink,
  Database,
  Activity,
  SlidersHorizontal,
  Loader2,
  Trash2,
  Server,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface TrendingItem {
  title: string;
  url: string;
  image: string | null;
  content?: string | null;
  source: string;
}

interface WebhookEvent {
  jobId: string;
  topic: string;
  status: string;
  timestamp: string;
  articlesCount: number;
  data: TrendingItem[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'feed' | 'architecture' | 'docs'>('feed');

  // Strict Data Source: 'google-news'
  const dataSource = 'google-news';

  // Scrape Parameters (No Limit Caps!)
  const [scrapeTopic, setScrapeTopic] = useState<string>('Artificial Intelligence');
  const [scrapeLimit, setScrapeLimit] = useState<number>(100);

  // Asynchronous Queue State (API Baru)
  const [asyncCallbackUrl, setAsyncCallbackUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAsyncCallbackUrl(`${window.location.origin}/api/webhook-receiver`);
    }
  }, []);
  const [asyncLoading, setAsyncLoading] = useState<boolean>(false);
  const [asyncLatency, setAsyncLatency] = useState<number | null>(null);
  const [asyncResult, setAsyncResult] = useState<any | null>(null);
  const [asyncError, setAsyncError] = useState<string | null>(null);

  // Queue Cleanup State
  const [cleanLoading, setCleanLoading] = useState<boolean>(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  // Feed Data State
  const [feedItems, setFeedItems] = useState<TrendingItem[]>([]);
  const [feedLoading, setFeedLoading] = useState<boolean>(false);
  const [feedStatusText, setFeedStatusText] = useState<string>('');
  const [pollTimeSeconds, setPollTimeSeconds] = useState<number>(0);

  // Search Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Code Snippets Tab
  const [codeTab, setCodeTab] = useState<'laravel' | 'webhook' | 'curl' | 'js'>('laravel');
  const [copied, setCopied] = useState<boolean>(false);

  // Clean Upstash Redis Queue & Storage (FLUSHDB)
  const handleCleanQueue = async () => {
    setCleanLoading(true);
    setCleanMessage(null);
    try {
      const res = await fetch('/api/scrape', { method: 'DELETE' });
      if (res.ok) {
        setFeedItems([]);
        setCleanMessage('Upstash Storage & Queue 100% FLUSHDB Cleared!');
        setTimeout(() => setCleanMessage(null), 3500);
      }
    } catch (err: any) {
      console.error('Failed to clean queue:', err);
    } finally {
      setCleanLoading(false);
    }
  };

  // Asynchronous Queue Trigger (API Baru - Enqueues Job & Polls for Webhook Payload)
  const handleTestAsync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAsyncLoading(true);
    setAsyncError(null);
    setAsyncResult(null);
    setFeedItems([]); // Clear old items immediately
    setFeedLoading(true);
    setPollTimeSeconds(0);
    setFeedStatusText(`Mengirim job ${scrapeLimit} data ke BullMQ Upstash Redis...`);

    const finalCallbackUrl = asyncCallbackUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/webhook-receiver` : 'https://scraper.blueseyes.id/api/webhook-receiver');

    const startTime = performance.now();

    try {
      const res = await fetch(`/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: scrapeTopic,
          source: dataSource,
          depth: scrapeLimit,
          callbackUrl: finalCallbackUrl,
          forceNew: true, // Generate fresh jobId for live result matching
        }),
      });

      const json = await res.json();
      const endTime = performance.now();

      setAsyncLatency(Math.round(endTime - startTime));
      if (res.ok) {
        setAsyncResult(json);
        const targetJobId = json.jobId;
        setFeedStatusText(`Worker Daemon sedang men-scrape ${scrapeLimit} data dari Google News...`);

        // Seconds Timer
        let seconds = 0;
        const timer = setInterval(() => {
          seconds++;
          setPollTimeSeconds(seconds);
        }, 1000);

        // Poll /api/webhook-results for targetJobId
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await fetch('/api/webhook-results');
            const pollJson = await pollRes.json();
            if (pollJson.status === 'success') {
              const events: WebhookEvent[] = pollJson.events || [];
              const matchedEvent = events.find((evt) => evt.jobId === targetJobId);

              if (matchedEvent && matchedEvent.data && matchedEvent.data.length > 0) {
                clearInterval(pollInterval);
                clearInterval(timer);
                setFeedItems(matchedEvent.data);
                setFeedLoading(false);
                setAsyncLoading(false);
              }
            }
          } catch (pollErr) {
            console.error('Polling error:', pollErr);
          }

          if (attempts >= 300) {
            clearInterval(pollInterval);
            clearInterval(timer);
            setFeedLoading(false);
            setAsyncLoading(false);
          }
        }, 1000);
      } else {
        setAsyncError(json.error || 'Failed to enqueue job');
        setFeedLoading(false);
        setAsyncLoading(false);
      }
    } catch (err: any) {
      setAsyncError(err.message || 'Error sending request');
      setFeedLoading(false);
      setAsyncLoading(false);
    }
  };

  // Search Filter
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return feedItems;
    const q = searchQuery.toLowerCase();
    return feedItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.content && item.content.toLowerCase().includes(q))
    );
  }, [feedItems, searchQuery]);

  const codeSnippets = {
    laravel: `<?php

namespace App\\Console\\Commands;

use Illuminate\\Console\\Command;
use Illuminate\\Support\\Facades\\Http;

class DispatchScraperJob extends Command
{
    protected $signature = 'scraper:dispatch {topic} {--source=${dataSource}} {--limit=${scrapeLimit}}';
    protected $description = 'Enqueue asynchronous scraping job to Next.js Scraper Cluster';

    public function handle()
    {
        $topic = $this->argument('topic');
        $source = $this->option('source') ?: 'google-news';
        $limit = (int) $this->option('limit');
        
        $response = Http::post('http://localhost:3000/api/scrape', [
            'topic' => $topic,
            'source' => $source,
            'depth' => $limit,
            'callbackUrl' => config('app.url') . '/api/v1/scraper/callback',
        ]);

        if ($response->successful()) {
            $this->info("Job enqueued! Job ID: " . $response->json('jobId'));
        } else {
            $this->error("Failed to enqueue job: " . $response->body());
        }
    }
}`,
    webhook: `<?php

namespace App\\Http\\Controllers\\Api;

use App\\Http\\Controllers\\Controller;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Log;

class ScraperWebhookController extends Controller
{
    public function handleCallback(Request $request)
    {
        // 1. Verify HMAC Signature (X-Scraper-Signature)
        $signature = $request->header('X-Scraper-Signature');
        $secret = env('WEBHOOK_SECRET', 'secret-key-super-aman');
        $expectedSignature = 'sha256=' . hash_hmac('sha256', $request->getContent(), $secret);

        if (!hash_equals($expectedSignature, (string)$signature)) {
            return response()->json(['error' => 'Invalid HMAC Signature'], 401);
        }

        // 2. Process Scraped Big Data Payload
        $payload = $request->json()->all();
        Log::info("Received Scraped Data for Job ID: " . $payload['jobId']);

        foreach ($payload['data'] as $article) {
            // Save or update news article with publisher og:image to Laravel DB
            \\App\\Models\\Article::updateOrCreate(
                ['url' => $article['url']],
                [
                    'title'   => $article['title'],
                    'image'   => $article['image'], // Gambar penerbit asli / og:image
                    'content' => $article['content'],
                    'source'  => $article['source'],
                ]
            );
        }

        return response()->json(['status' => 'success', 'message' => 'Data ingested']);
    }
}`,
    curl: `# 1. Enqueue Job (Asynchronous - Source: ${dataSource})
curl -X POST http://localhost:3000/api/scrape \\
  -H "Content-Type: application/json" \\
  -d '{
    "topic": "${scrapeTopic}",
    "source": "${dataSource}",
    "depth": ${scrapeLimit},
    "callbackUrl": "${asyncCallbackUrl}"
  }'

# 2. Clean Upstash Storage & Redis Queue (FLUSHDB)
curl -X DELETE http://localhost:3000/api/scrape`,
    js: `// Enqueue Scraping Job from Node.js / Next.js
const response = await fetch('http://localhost:3000/api/scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: '${scrapeTopic}',
    source: '${dataSource}', // 'threads' | 'google-news'
    depth: ${scrapeLimit},
    callbackUrl: '${asyncCallbackUrl}',
  }),
});

const result = await response.json();
console.log('Enqueued Job ID:', result.jobId);`,
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-4 sm:p-8 selection:bg-emerald-500/20 selection:text-emerald-300">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Cpu className="h-8 w-8 text-emerald-400" />
                Big Data Scraper Engine
              </h1>
              <p className="text-zinc-400 text-sm sm:text-base max-w-2xl">
                Arsitektur Asynchronous Queue & Webhook berbasis <strong>BullMQ + Upstash Redis Cloud</strong>.
              </p>
            </div>

            {/* Clean Queue & Storage Utility Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanQueue}
              disabled={cleanLoading}
              className="gap-2 border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900/50 text-xs"
            >
              {cleanLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {cleanMessage || 'Clean Redis Queue'}
            </Button>
          </div>

          {/* Navigation Bar */}
          <div className="flex items-center gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
            <Button
              variant={activeTab === 'feed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('feed')}
              className={`gap-2 ${activeTab === 'feed' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400'}`}
            >
              <Database className="h-4 w-4 text-emerald-400" />
              Scraper Dashboard ({feedItems.length} Data Loaded)
            </Button>
            <Button
              variant={activeTab === 'architecture' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('architecture')}
              className={`gap-2 ${activeTab === 'architecture' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400'}`}
            >
              <Activity className="h-4 w-4 text-indigo-400" />
              Overview Arsitektur Queue & Webhook
            </Button>
            <Button
              variant={activeTab === 'docs' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('docs')}
              className={`gap-2 ${activeTab === 'docs' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400'}`}
            >
              <BookOpen className="h-4 w-4 text-cyan-400" />
              Integrasi Laravel
            </Button>
          </div>
        </header>

        {/* Tab 1: Scraper Control Panel & Results Feed */}
        {activeTab === 'feed' && (
          <div className="space-y-6">
            {/* Control Panel */}
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-6 space-y-6">
                {/* Row 1: Source Indicator (Google News) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Sumber Data Scraping:
                    </span>
                    <div className="flex items-center gap-2 pt-1">
                      <Badge variant="indigo" className="text-xs px-3 py-1 font-semibold gap-1.5 bg-indigo-500/20 text-indigo-300 border-indigo-500/50">
                        Google News RSS & Decoded URLs
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                    <Server className="h-4 w-4 text-emerald-400" />
                    <span>Upstash Cloud Redis Active</span>
                  </div>
                </div>

                {/* Row 2: Form Input Parameters */}
                <form onSubmit={(e) => handleTestAsync(e)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-zinc-500" />
                        Topic / Kata Kunci Scraping:
                      </label>
                      <Input
                        type="text"
                        value={scrapeTopic}
                        onChange={(e) => setScrapeTopic(e.target.value)}
                        placeholder="e.g. Artificial Intelligence"
                        required
                        className="text-xs"
                      />
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
                        Target Data (Depth Limit):
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={scrapeLimit}
                        onChange={(e) => setScrapeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                        required
                        className="text-xs font-bold text-emerald-400 border-emerald-900/50"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <Button
                        type="submit"
                        variant="emerald"
                        className="w-full font-semibold gap-2"
                        disabled={asyncLoading || feedLoading}
                      >
                        {asyncLoading || feedLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Processing ({pollTimeSeconds}s)...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" /> Scrape Google News ({scrapeLimit} Data)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-zinc-500" />
                      Callback Webhook URL Ingestion:
                    </label>
                    <Input
                      type="url"
                      value={asyncCallbackUrl}
                      onChange={(e) => setAsyncCallbackUrl(e.target.value)}
                      required
                      placeholder="http://localhost:3000/api/webhook-receiver"
                      className="text-xs font-mono"
                    />
                  </div>
                </form>

                {/* Filter & Item Counter */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-800/80">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      type="text"
                      placeholder="Filter list postingan di layar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>

                  <span className="text-xs text-zinc-400 font-mono">
                    Total Displayed: <strong className="text-white">{filteredData.length}</strong> items (Source: <strong className="text-indigo-400">Google News Only</strong>)
                  </span>
                </div>
              </CardContent>
            </Card>

            {asyncError && (
              <div className="p-4 bg-rose-950/50 border border-rose-900/50 rounded-xl text-rose-300 text-sm flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0" /> {asyncError}
              </div>
            )}

            {/* Loading Animation & Live Counter */}
            {feedLoading || asyncLoading ? (
              <div className="space-y-6">
                <Card className="border-emerald-500/30 bg-emerald-950/20">
                  <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-center">
                    <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-emerald-300">
                        {feedStatusText || `Sedang memproses ${scrapeLimit} data dari Google News...`}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono">
                        Waktu berjalan: <span className="text-emerald-400 font-bold">{pollTimeSeconds} detik</span>. Layar akan otomatis ter-update begitu data Webhook diterima.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Card key={i} className="h-72 animate-pulse bg-zinc-900/50 border-zinc-800/80" />
                  ))}
                </div>
              </div>
            ) : filteredData.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <Database className="h-10 w-10 text-zinc-600 mx-auto" />
                  <p className="text-zinc-400 text-sm">
                    Belum ada data postingan. Klik <strong>"Scrape Google News"</strong> untuk mengambil data.
                  </p>
                  <Button
                    onClick={() => {
                      setActiveTab('feed');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  >
                    Scrape Google News ({scrapeLimit} Data)
                  </Button>
                </CardContent>
              </Card>
            ) : (
              /* Display ALL items */
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-zinc-800">
                  <span>Menampilkan <strong>{filteredData.length}</strong> berita dari <strong>Google News</strong>:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredData.map((item, idx) => (
                    <Card key={idx} className="flex flex-col justify-between hover:border-zinc-700 transition-all group">
                      <div className="h-40 bg-zinc-900 border-b border-zinc-800 overflow-hidden flex items-center justify-center relative">
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <span className="text-3xl font-bold text-zinc-700">
                            {item.source.toUpperCase().slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <CardContent className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant={item.source.toLowerCase().includes('threads') ? 'amber' : 'indigo'} className="text-[10px]">
                              {item.source}
                            </Badge>
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                              <Check className="h-3 w-3" /> Webhook Ingested
                            </span>
                          </div>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-base font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-2">
                            {item.title}
                          </a>
                          {item.content && <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{item.content}</p>}
                        </div>
                        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                            View Source <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Queue & Webhook Architecture Overview */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <Card className="border-t-4 border-t-emerald-500 bg-zinc-900/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Badge variant="emerald" className="uppercase tracking-wider text-[10px]">
                      Arsitektur Produksi Modern
                    </Badge>
                    <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-emerald-400" />
                      Asynchronous Job Queue & Webhook Callback Engine
                    </CardTitle>
                  </div>
                  <code className="text-xs bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 font-mono text-emerald-400">
                    POST /api/scrape
                  </code>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-xs text-zinc-500 font-medium">HTTP Response Latency</span>
                    <p className="text-lg font-bold text-emerald-400">&lt; 15 ms (Instant 202 Accepted)</p>
                  </div>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-xs text-zinc-500 font-medium">Kapasitas Skalabilitas</span>
                    <p className="text-lg font-bold text-emerald-400">~10,000 - 100,000+ data/hari</p>
                  </div>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-xs text-zinc-500 font-medium">Upstash Redis Deduplication</span>
                    <p className="text-lg font-bold text-emerald-400">Automated (`jobId` deduplication)</p>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    Bagaimana Alur Kerja Sistem Ini?
                  </h4>
                  <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Aplikasi Laravel / Frontend mengirim request `POST /api/scrape` membawa parameter topic, source, dan URL callback Webhook.</li>
                    <li>Next.js API mengembalikan response instant **202 Accepted (&lt; 15ms)** dengan `jobId`, tanpa memblokir server.</li>
                    <li>Worker Daemon di background mengambil job dari **Upstash Cloud Redis**, membuka Playwright browser context pool, dan melakukan scraping.</li>
                    <li>Setelah data selesai terkumpul, Worker mengirimkan payload hasil ke **Webhook Callback URL** (diakreditasi dengan HMAC SHA256 Signature `X-Scraper-Signature`).</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 3: Laravel Integration Docs */}
        {activeTab === 'docs' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-cyan-400" />
                Panduan Integrasi Backend Laravel
              </CardTitle>
              <CardDescription>
                Potongan kode integrasi untuk mengirim job scraping dan menerima Webhook callback di Laravel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                {(['laravel', 'webhook', 'curl', 'js'] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={codeTab === tab ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCodeTab(tab)}
                    className={codeTab === tab ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'}
                  >
                    {tab === 'laravel'
                      ? '1. Artisan Command (Enqueue)'
                      : tab === 'webhook'
                      ? '2. Webhook Controller (Laravel)'
                      : tab === 'curl'
                      ? '3. cURL CLI'
                      : '4. Node.js Client'}
                  </Button>
                ))}
              </div>

              <div className="relative bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(codeSnippets[codeTab])}
                  className="absolute top-3 right-3 gap-1.5 text-xs h-7 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Code'}
                </Button>
                <pre className="leading-relaxed whitespace-pre-wrap">{codeSnippets[codeTab]}</pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
