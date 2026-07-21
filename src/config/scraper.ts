export const SCRAPER_CONFIG = {
    threadsSearchUrl: process.env.THREADS_SEARCH_URL || 'https://www.threads.net/search',
    googleNewsRssUrl: (query: string) => `https://news.google.com/rss/search?q=${query}&hl=id&gl=ID&ceid=ID:id`,
    defaultFallbackQuery: process.env.FALLBACK_SEARCH_QUERY || 'AI OR "Artificial Intelligence" OR Teknologi OR Programming OR "Kecerdasan Buatan"',
    userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'id-ID',
    timeoutMs: parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10),
    waitAfterLoadMs: parseInt(process.env.SCRAPER_WAIT_TIME || '3000', 10),
    systemWords: [
        'home', 'search', 'activity', 'profile', 'write', 'settings', 
        'threads', 'log in', 'sign up', 'about', 'help', 'press', 
        'api', 'jobs', 'privacy', 'terms', 'cookies', 'report a problem',
        'beranda', 'cari', 'buat', 'aktivitas', 'profil', 'tentang',
        'bantuan', 'pers', 'karir', 'privasi', 'ketentuan', 'cookie',
        'laporkan masalah', 'selengkapnya', 'masuk', 'daftar', 'utas'
    ]
};
