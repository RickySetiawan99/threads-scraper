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

                                        {Array.from({ length: totalPages }).map((_, i) => {
                                            const pageNum = i + 1;
                                            return (
                                                <button
                                                    key={pageNum}
                                                    type="button"
                                                    onClick={() => handlePageChange(pageNum)}
                                                    className={`${styles.pageButton} ${
                                                        currentPage === pageNum ? styles.pageButtonActive : ''
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}

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
            </div>
        </div>
    );
}
