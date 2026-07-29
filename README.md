# Google News Scraper API

A high-performance, modular Next.js API scraper designed to fetch trending topics and news articles from Google News RSS & Decoded URLs.

## Features

- **Google News RSS & Decoded URLs**: Fetches Google News RSS feeds and decodes `CBMi...` redirect links using Google's internal batchexecute API.
- **Deep Metadata Resolution**: Resolves original publisher URLs and extracts article featured images (`og:image`).
- **Clean & Modular Architecture**: Code is decoupled into dedicated services (`src/services`), configuration definitions (`src/config`), and helper utilities (`src/utils`).
- **Highly Configurable**: Fully managed via environment variables (`.env`).
- **Fully Type-Safe**: Developed completely in TypeScript with strict compile-time checks.

---

## Directory Structure

```
├── src/
│   ├── app/
│   │   └── api/
│   │       └── trending/
│   │           └── route.ts     # Clean Controller (API Entrypoint)
│   ├── config/
│   │   └── scraper.ts           # Centralized Config & .env Fallbacks
│   ├── services/
│   │   └── news.service.ts      # Google News Fetcher & Redirect Resolver
│   └── utils/
│       └── html.ts              # DOM & Text Formatting Helpers
├── .env.example
├── .env.local
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js (v18.x or later recommended)
- npm, yarn, pnpm, or bun

### 1. Installation

Clone the repository and install the dependencies:

```bash
npm install
```

Install Playwright browsers (Chromium is required for headless execution):

```bash
npx playwright install chromium
```

### 2. Configuration

Copy the example environment file and customize it:

```bash
cp .env.example .env.local
```

Open `.env.local` and set your preferred configurations:

```env
# Target URL for Threads search
THREADS_SEARCH_URL=https://www.threads.net/search

# Query keywords for Google News RSS fallback (supports advanced query operators)
FALLBACK_SEARCH_QUERY="AI OR 'Artificial Intelligence' OR Teknologi OR Programming OR 'Kecerdasan Buatan'"

# Custom User Agent to bypass browser-bot detection
SCRAPER_USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Timeout settings (in milliseconds)
SCRAPER_TIMEOUT=15000
SCRAPER_WAIT_TIME=3000
```

### 3. Run the Development Server

Start the Next.js server locally:

```bash
npm run dev
```

The API will now be accessible at `http://localhost:3000`.

---

## API Usage

### `GET /api/trending`

Returns the list of current trending topics/articles in JSON format.

#### Example Request
```bash
curl http://localhost:3000/api/trending
```

#### Example Response
```json
{
  "status": "success",
  "source": "Threads Scraper",
  "data": [
    {
      "title": "Akselerasi AI di Indonesia",
      "url": "https://www.threads.net/search?q=Akselerasi%20AI%20di%20Indonesia",
      "image": null,
      "content": null,
      "source": "Threads"
    },
    {
      "title": "NVIDIA Batam AI Hub",
      "url": "https://www.idnfinancials.com/news/12345/nvidia-batam-ai-hub",
      "image": "https://www.idnfinancials.com/images/nvidia-hub.jpg",
      "content": "NVIDIA berkolaborasi membangun pusat kecerdasan buatan terbesar di Batam...",
      "source": "Google News (IT/AI)"
    }
  ]
}
```

---

## Deployment

This project is fully compatible with Next.js deployment guidelines. You can deploy it to Vercel, Docker containers, or any cloud VM.

*Note: Ensure that your target deployment environment has dependencies for running headless Chromium (Playwright).*

---

## License

This project is private and proprietary. Refer to your system administrator for license terms.
