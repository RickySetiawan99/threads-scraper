'use client';

import { useState, useEffect, useMemo } from 'react';
import styles from './page.module.css';

interface TrendingItem {
    title: string;
    url: string;
    image: string | null;
    content?: string | null;
    source: string;
}

export default function Home() {
    const [fetchLimit, setFetchLimit] = useState<number>(12);
    const [data, setData] = useState<TrendingItem[]>([]);
    const [source, setSource] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Client-side Search & Pagination State
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 6;

    // API Guide Tab & Copy State
    const [activeTab, setActiveTab] = useState<'curl' | 'js' | 'php' | 'python' | 'response'>('curl');
    const [copied, setCopied] = useState<boolean>(false);

    const fetchTrending = async (limit: number) => {
        setLoading(true);
        setError(null);
        setCurrentPage(1);
        try {
            const res = await fetch(`/api/trending?limit=${limit}`);
            const json = await res.json();
            if (json.status === 'success') {
                setData(json.data || []);
                setSource(json.source || 'Scraper Engine');
            } else {
                setError(json.message || 'Failed to fetch trending data.');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrending(fetchLimit);
    }, []);

    const handleFetch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchTrending(fetchLimit);
    };

    // Real-time Search Filtering
    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) return data;
        const q = searchQuery.toLowerCase();
        return data.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                (item.content && item.content.toLowerCase().includes(q))
        );
    }, [data, searchQuery]);

    // Client-side Pagination
    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentData = filteredData.slice(startIndex, endIndex);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Code Snippets for API Integration Guide
    const codeSnippets = {
        curl: `curl -X GET "http://localhost:3000/api/trending?limit=${fetchLimit}"`,
        js: `const response = await fetch("http://localhost:3000/api/trending?limit=${fetchLimit}");
const data = await response.json();
console.log(data);`,
        php: `use Illuminate\\Support\\Facades\\Http;

$response = Http::get('http://localhost:3000/api/trending', [
    'limit' => ${fetchLimit},
]);

$articles = $response->json();`,
        python: `import requests

response = requests.get("http://localhost:3000/api/trending", params={"limit": ${fetchLimit}})
data = response.json()
print(data)`,
        response: `{
  "status": "success",
  "source": "${source || 'Threads Scraping'}",
  "total": ${data.length || 5},
  "data": [
    {
      "title": "${data[0]?.title || 'Sample Trending Article Title'}",
      "url": "${data[0]?.url || 'https://www.threads.net/...'}",
      "image": "${data[0]?.image || 'https://example.com/thumb.jpg'}",
      "content": "${data[0]?.content ? data[0].content.slice(0, 80) + '...' : 'Extracted article content snippet...'}",
      "source": "${data[0]?.source || 'Threads'}"
    }
  ]
}`
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.container}>
            <div className={styles.wrapper}>
                <header className={styles.header}>
                    <div className={styles.topBar}>
                        <div className={styles.badge}>
                            Next.js Scraper Engine
                        </div>
                    </div>
                    <h1 className={styles.title}>Trending Topics Dashboard</h1>
                    <p className={styles.subtitle}>
                        Real-time intelligence feed aggregating tech, AI, and social topics from Threads.net & Google News.
                    </p>
                </header>

                <form onSubmit={handleFetch} className={styles.controlsCard}>
                    <div className={styles.controlGroup}>
                        <label className={styles.label} htmlFor="limit-input">
                            Scrape Limit:
                        </label>
                        <input
                            id="limit-input"
                            type="number"
                            min="1"
                            max="100"
                            value={fetchLimit}
                            onChange={(e) => setFetchLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                            className={styles.input}
                        />

                        <input
                            type="text"
                            placeholder="Filter topics..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className={styles.searchInput}
                        />
                    </div>

                    <div className={styles.controlGroup}>
                        {source && (
                            <div className={styles.sourceInfo}>
                                Source:
                                <span
                                    className={`${styles.sourceBadge} ${
                                        source.toLowerCase().includes('threads')
                                            ? styles.sourceThreads
                                            : styles.sourceNews
                                    }`}
                                >
                                    {source}
                                </span>
                            </div>
                        )}

                        <button type="submit" disabled={loading} className={styles.button}>
                            {loading ? (
                                <>
                                    <span className={styles.spinner}></span> Fetching...
                                </>
                            ) : (
                                'Fetch Latest'
                            )}
                        </button>
                    </div>
                </form>

                {error && (
                    <div className={styles.errorAlert}>
                        <span>Error:</span> {error}
                    </div>
                )}

                <main>
                    {loading ? (
                        <div className={styles.grid3Col}>
                            {Array.from({ length: itemsPerPage }).map((_, i) => (
                                <div key={i} className={styles.loadingSkeleton}></div>
                            ))}
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className={styles.controlsCard} style={{ justifyContent: 'center' }}>
                            <p className={styles.subtitle}>No matching topics found.</p>
                        </div>
                    ) : (
                        <>
                            <div className={styles.grid3Col}>
                                {currentData.map((item, idx) => (
                                    <article key={idx} className={styles.card}>
                                        <div className={styles.cardImageWrapper}>
                                            {item.image ? (
                                                <img src={item.image} alt={item.title} className={styles.cardImage} />
                                            ) : (
                                                <div className={styles.placeholderImage}>
                                                    {item.source.toUpperCase().slice(0, 1)}
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.cardContent}>
                                            <div className={styles.cardHeader}>
                                                <span
                                                    className={`${styles.sourceBadge} ${
                                                        item.source.toLowerCase().includes('threads')
                                                            ? styles.sourceThreads
                                                            : styles.sourceNews
                                                    }`}
                                                >
                                                    {item.source}
                                                </span>
                                            </div>

                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.cardTitle}
                                            >
                                                {item.title}
                                            </a>

                                            {item.content && <p className={styles.snippet}>{item.content}</p>}

                                            <div className={styles.cardFooter}>
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={styles.linkButton}
                                                >
                                                    View Source
                                                </a>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            {/* Client-side Pagination Controls */}
                            {totalPages > 1 && (
                                <div className={styles.paginationContainer}>
                                    <div className={styles.paginationInfo}>
                                        Showing {startIndex + 1} - {Math.min(endIndex, filteredData.length)} of {filteredData.length} items (Page {currentPage} of {totalPages})
                                    </div>
                                    <div className={styles.paginationControls}>
                                        <button
                                            type="button"
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className={styles.pageButton}
                                        >
                                            Prev
                                        </button>

                                        {(() => {
                                            const pages: (number | string)[] = [];
                                            const siblings = 1;
                                            const left = Math.max(2, currentPage - siblings);
                                            const right = Math.min(totalPages - 1, currentPage + siblings);

                                            pages.push(1);
                                            if (left > 2) pages.push('…start');
                                            for (let i = left; i <= right; i++) pages.push(i);
                                            if (right < totalPages - 1) pages.push('…end');
                                            if (totalPages > 1) pages.push(totalPages);

                                            return pages.map((p) =>
                                                typeof p === 'string' ? (
                                                    <span key={p} className={styles.pageEllipsis}>…</span>
                                                ) : (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => handlePageChange(p)}
                                                        className={`${styles.pageButton} ${
                                                            currentPage === p ? styles.pageButtonActive : ''
                                                        }`}
                                                    >
                                                        {p}
                                                    </button>
                                                )
                                            );
                                        })()}

                                        <button
                                            type="button"
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className={styles.pageButton}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </main>

                {/* API Quickstart & Integration Documentation Section */}
                <section className={styles.apiSection}>
                    <div className={styles.apiHeader}>
                        <div>
                            <h2 className={styles.apiTitle}>API Quickstart & Integration</h2>
                            <p className={styles.apiDescription}>
                                Consume this REST API endpoint directly in your Laravel, Node.js, or Python backend.
                            </p>
                        </div>
                    </div>

                    <div className={styles.tabList}>
                        {(['curl', 'js', 'php', 'python', 'response'] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`${styles.tabButton} ${
                                    activeTab === tab ? styles.tabButtonActive : ''
                                }`}
                            >
                                {tab === 'curl'
                                    ? 'cURL'
                                    : tab === 'js'
                                    ? 'JavaScript / Node'
                                    : tab === 'php'
                                    ? 'Laravel / PHP'
                                    : tab === 'python'
                                    ? 'Python'
                                    : 'JSON Response'}
                            </button>
                        ))}
                    </div>

                    <div className={styles.codeBlockContainer}>
                        <button
                            type="button"
                            onClick={() => handleCopy(codeSnippets[activeTab])}
                            className={styles.copyButton}
                        >
                            {copied ? 'Copied!' : 'Copy Code'}
                        </button>
                        <pre className={styles.codeText}>{codeSnippets[activeTab]}</pre>
                    </div>

                    <table className={styles.paramTable}>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Type</th>
                                <th>Default</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code className={styles.paramCode}>limit</code></td>
                                <td>integer</td>
                                <td>10</td>
                                <td>Number of trending items to fetch (1 - 100).</td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </div>
        </div>
    );
}
