// ============================================================
// API SERVICE LAYER — Connects to FastAPI Backend
// Falls back to mock data if backend is unreachable
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_INTERVAL = 30_000; // 30 seconds

// ─── Fetch wrapper with timeout + error handling ─────────────

async function apiFetch<T>(
    endpoint: string,
    options?: RequestInit & { timeout?: number }
): Promise<{ data: T | null; error: string | null; isLive: boolean }> {
    const { timeout = 15000, ...fetchOptions } = options || {};

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(`${API_BASE}${endpoint}`, {
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...fetchOptions.headers,
            },
            ...fetchOptions,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            return {
                data: null,
                error: `API returned ${res.status}: ${res.statusText}`,
                isLive: false,
            };
        }

        const data = await res.json();
        return { data, error: null, isLive: true };
    } catch (err: any) {
        const message =
            err.name === "AbortError"
                ? "Request timed out"
                : err.message || "Network error";
        return { data: null, error: message, isLive: false };
    }
}

// ─── Backend Data Types ──────────────────────────────────────

export interface BackendArticle {
    title: string;
    published: string;
    source: string;
    link: string;
    themes: Record<string, number>;
    strength: number;
    confidence: number;
    sentiment: number;  // VADER compound score: -1 to 1
    heat: number;
    recency: number;
    summary: string;    // First 200 chars of article text
}

export interface BackendAlert {
    category: string;
    trigger: string;
    title: string;
    source: string;
    published: string;
}

export interface BackendTimelineSnapshot {
    timestamp: string;
    scores: Record<string, number>;
}

export interface BackendDashboardResponse {
    heatmap: Record<string, number>;
    alerts: BackendAlert[];
    timeline: BackendTimelineSnapshot[];
    sst: any;
}

// ─── API Endpoints ───────────────────────────────────────────

/** Fetch full dashboard payload */
export async function fetchDashboard() {
    return apiFetch<BackendDashboardResponse>("/dashboard");
}

/** Fetch scored articles from NLP pipeline */
export async function fetchArticles() {
    return apiFetch<{ articles: BackendArticle[] }>("/articles");
}

/** Fetch theme heatmap scores */
export async function fetchHeatmap() {
    return apiFetch<{ heatmap: Record<string, number> }>("/heatmap");
}

/** Fetch timeline snapshots */
export async function fetchTimeline() {
    return apiFetch<{ timeline: BackendTimelineSnapshot[] }>("/timeline");
}

/** Fetch alerts */
export async function fetchAlerts() {
    return apiFetch<{ alerts: BackendAlert[] }>("/alerts");
}

/** Fetch SST output */
export async function fetchSST() {
    return apiFetch<any>("/sst");
}

/** Fetch AI briefing */
export async function fetchBriefing(items?: PortfolioInputItem[]) {
    return apiFetch<{ briefing: string }>("/briefing", {
        method: "POST",
        body: items && items.length > 0 ? JSON.stringify(items) : undefined,
    });
}

/** Check if backend is reachable */
export async function checkBackendStatus() {
    return apiFetch<{ status: string }>("/", { timeout: 5000 });
}

// ─── Portfolio Types ─────────────────────────────────────────

export interface PortfolioHolding {
    ticker: string;
    name: string;
    sector: string;
    quantity: number;
    price: number;
    change: number;
    changePct: number;
    holdingValue: number;
    volume: number;
    marketCap: number;
    dayHigh: number;
    dayLow: number;
    yearHigh: number;
    yearLow: number;
    sparkline: number[];
    error?: string;
}

export interface PortfolioResponse {
    holdings: PortfolioHolding[];
    totalValue: number;
    totalChange: number;
    totalChangePct: number;
}

export interface PortfolioInputItem {
    ticker: string;
    name: string;
    quantity: number;
    sector: string;
}

/** Fetch live portfolio stock data */
export async function fetchPortfolio(items?: PortfolioInputItem[]) {
    return apiFetch<PortfolioResponse>("/portfolio", {
        method: "POST",
        body: items && items.length > 0 ? JSON.stringify(items) : undefined,
        timeout: 30000
    });
}

export interface PortfolioShiftResponse {
    shifts: Record<string, number>;
    portfolioShift: number;
}

/** Fetch portfolio performance since a specific timestamp */
export async function fetchPortfolioShift(timestamp: string, items?: PortfolioInputItem[]) {
    return apiFetch<PortfolioShiftResponse>("/portfolio/shift", {
        method: "POST",
        body: JSON.stringify({ timestamp, items: items && items.length > 0 ? items : undefined }),
        timeout: 30000
    });
}

// ─── Data Transformers ───────────────────────────────────────
// Transform backend data shapes into the format the UI components expect

/**
 * Transform backend articles into the NewsItem format used by the frontend.
 */
export function transformArticlesToNews(articles: BackendArticle[]) {
    return articles.map((article, index) => {
        // Determine the dominant theme
        const themeEntries = Object.entries(article.themes);
        const topTheme = themeEntries.length > 0
            ? themeEntries.sort((a, b) => b[1] - a[1])[0][0]
            : "Unknown";

        // Use real VADER sentiment from backend if available, else derive from theme
        let sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
        if (article.sentiment !== undefined) {
            // VADER compound score: -1 to 1
            if (article.sentiment > 0.1) sentiment = "BULLISH";
            else if (article.sentiment < -0.1) sentiment = "BEARISH";
        } else {
            // Fallback: derive from theme
            const bearishThemes = [
                "Inflation Shock", "Recession Risk", "Banking Stress", "Credit Crunch",
                "Energy Shock", "Risk Off", "Volatility Shock", "Geopolitical Escalation",
                "Growth Slowdown", "Monetary Tightening",
            ];
            const bullishThemes = [
                "Growth Reacceleration", "Monetary Easing", "Risk On", "Disinflation",
            ];
            if (bearishThemes.includes(topTheme)) sentiment = "BEARISH";
            else if (bullishThemes.includes(topTheme)) sentiment = "BULLISH";
        }

        // Parse source URL to readable name
        let sourceName = article.source;
        try {
            const url = new URL(article.source);
            const host = url.hostname.replace("www.", "").replace("feeds.", "");
            const nameMap: Record<string, string> = {
                "bbci.co.uk": "BBC",
                "nytimes.com": "NYT",
                "investing.com": "Investing.com",
                "skynews.com": "Sky News",
                "sky.com": "Sky News",
                "cnbc.com": "CNBC",
                "marketwatch.com": "MarketWatch",
                "yahoo.com": "Yahoo Finance",
                "reuters.com": "Reuters",
                "bloomberg.com": "Bloomberg",
                "ft.com": "FT",
                "wsj.com": "WSJ",
            };
            sourceName = nameMap[host] || host.split(".")[0].charAt(0).toUpperCase() + host.split(".")[0].slice(1);
        } catch {
            // Keep original source if URL parsing fails
        }

        // Calculate time ago from published date
        let timeAgo = article.published;
        try {
            const pubDate = new Date(article.published);
            const now = new Date();
            const diffMs = now.getTime() - pubDate.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor(diffMs / (1000 * 60));

            if (diffMins < 60) timeAgo = `${diffMins}m ago`;
            else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
            else timeAgo = `${Math.floor(diffHours / 24)}d ago`;
        } catch {
            // Keep original string
        }

        // Relevance score from confidence + heat
        const relevance = Math.round(
            50 + article.confidence * 30 + Math.min(article.heat || 0, 20)
        );

        return {
            id: index + 1,
            headline: article.title,
            summary: article.summary || `Theme strength: ${(article.strength * 100).toFixed(0)}% · Confidence: ${(article.confidence * 100).toFixed(0)}%`,
            source: sourceName,
            link: article.link || "",
            timestamp: article.published,
            timeAgo,
            sentiment,
            theme: topTheme,
            relevance,
            heat: article.heat || 0,
        };
    });
}

/**
 * Transform backend heatmap {theme: score} into a format 
 * suitable for the dashboard heatmap section.
 */
export function transformHeatmapToKpis(heatmap: Record<string, number>) {
    return Object.entries(heatmap).map(([label, value]) => ({
        label,
        value: Math.round(value * 100) / 100,
        status: value > 0 ? ("pos" as const) : ("neg" as const),
    }));
}

/**
 * Transform backend heatmap into theme frequency counts.
 * Higher heat score = more frequent theme.
 */
export function transformHeatmapToFrequency(heatmap: Record<string, number>) {
    const maxScore = Math.max(...Object.values(heatmap), 1);
    return Object.entries(heatmap)
        .sort((a, b) => b[1] - a[1])
        .map(([theme, score]) => ({
            theme,
            count: Math.max(1, Math.round((score / maxScore) * 15)),
        }));
}

/**
 * Transform timeline snapshots into the 7-day heatmap matrix format.
 * Each row is a theme, each column is a snapshot time.
 */
export function transformTimelineToHeatmapMatrix(
    timeline: BackendTimelineSnapshot[],
    heatmap: Record<string, number>
) {
    // Use last 7 snapshots or pad with empty
    const snapshots = timeline.slice(-7);
    const themes = Object.keys(heatmap);

    const days = snapshots.map((s) => {
        try {
            const d = new Date(s.timestamp);
            return d.toLocaleDateString("en-US", { weekday: "short" });
        } catch {
            return s.timestamp.slice(0, 10);
        }
    });

    // Pad days to 7 if less
    while (days.length < 7) {
        days.unshift("—");
    }

    const rows = themes.map((theme) => {
        const cells = [];
        for (let i = 0; i < 7; i++) {
            const snapshot = snapshots[i];
            if (snapshot && snapshot.scores[theme] !== undefined) {
                // Normalize score to -100..100 range
                const raw = snapshot.scores[theme];
                const normalized = Math.max(-100, Math.min(100, Math.round(raw * 10)));
                cells.push({ value: normalized });
            } else {
                cells.push({ value: 0 });
            }
        }
        return { theme, cells };
    });

    return { days, rows };
}

/**
 * Transform alerts into event-ticker format.
 */
export function transformAlertsToEvents(alerts: BackendAlert[]) {
    return alerts.slice(0, 8).map((alert) => {
        let time = "";
        try {
            const d = new Date(alert.published);
            time = d.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        } catch {
            time = "—";
        }

        return {
            time,
            title: alert.title.length > 50 ? alert.title.slice(0, 47) + "..." : alert.title,
            impact: alert.category === "Geopolitical" || alert.category === "Market"
                ? "HIGH"
                : "MEDIUM",
        };
    });
}

// ─── Polling Hook Export ─────────────────────────────────────
export { POLL_INTERVAL };
