"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  newsData as mockNewsData,
  dashboardData as mockDashboardData,
  dataSources,
} from "@/data/mockData";
import {
  fetchDashboard,
  fetchArticles,
  fetchBriefing,
  fetchPortfolio,
  fetchPortfolioShift,
  transformArticlesToNews,
  transformAlertsToEvents,
  BackendDashboardResponse,
  BackendArticle,
  PortfolioResponse,
  PortfolioInputItem,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import LiveStatusBadge from "@/components/LiveStatusBadge";

export default function DashboardPage() {
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
  const [portfolioShifts, setPortfolioShifts] = useState<Record<number, { shift?: number; shifts?: Record<string, number>; loading: boolean }>>({});
  const [customHoldings, setCustomHoldings] = useState<PortfolioInputItem[]>([]);

  // Load custom portfolio from local storage
  useEffect(() => {
    const loadHoldings = () => {
      const saved = localStorage.getItem("customPortfolio");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomHoldings(parsed);
          } else {
            setCustomHoldings([]);
          }
        } catch (e) {
          setCustomHoldings([]);
        }
      } else {
        setCustomHoldings([]);
      }
    };

    loadHoldings();

    // Listen for events from other components and tabs
    window.addEventListener("portfolioUpdated", loadHoldings);
    window.addEventListener("storage", loadHoldings);

    return () => {
      window.removeEventListener("portfolioUpdated", loadHoldings);
      window.removeEventListener("storage", loadHoldings);
    };
  }, []);

  // ─── Live data polling ───────────────────────────────────
  const dashboardFetcher = useCallback(() => fetchDashboard(), []);
  const articlesFetcher = useCallback(() => fetchArticles(), []);
  const briefingFetcher = useCallback(() => fetchBriefing(customHoldings.length > 0 ? customHoldings : undefined), [customHoldings]);
  const portfolioFetcher = useCallback(() => fetchPortfolio(customHoldings.length > 0 ? customHoldings : undefined), [customHoldings]);

  const {
    data: dashboardLive,
    isLive: isDashLive,
    isLoading: isDashLoading,
    lastUpdated,
    error: dashError,
    refresh: refreshDash,
  } = usePolling<BackendDashboardResponse>({
    fetcher: dashboardFetcher,
    interval: 30_000,
  });

  const {
    data: articlesLive,
    isLive: isArticlesLive,
  } = usePolling<{ articles: BackendArticle[] }>({
    fetcher: articlesFetcher,
    interval: 30_000,
  });

  const {
    data: briefingLive,
  } = usePolling<{ briefing: string }>({
    fetcher: briefingFetcher,
    interval: 60_000,
  });

  const {
    data: portfolioLive,
    isLive: isPortfolioLive,
    isLoading: isPortfolioLoading,
  } = usePolling<PortfolioResponse>({
    fetcher: portfolioFetcher,
    interval: 60_000,
  });

  // ─── Derived data ───────────────────────────────────────
  const isLive = isDashLive || isArticlesLive || isPortfolioLive;

  const newsItems = useMemo(() => {
    if (articlesLive?.articles) {
      return transformArticlesToNews(articlesLive.articles).slice(0, 15);
    }
    return mockNewsData.slice(0, 15);
  }, [articlesLive]);

  const events = useMemo(() => {
    if (dashboardLive?.alerts && dashboardLive.alerts.length > 0) {
      return transformAlertsToEvents(dashboardLive.alerts);
    }
    return mockDashboardData.events;
  }, [dashboardLive]);

  const briefingText = useMemo(() => {
    if (briefingLive?.briefing) return briefingLive.briefing;
    return mockDashboardData.briefing;
  }, [briefingLive]);

  // Article Dropdown Handler
  const handleArticleClick = async (articleId: number, timestamp: string) => {
    if (expandedArticle === articleId) {
      setExpandedArticle(null);
      return;
    }
    setExpandedArticle(articleId);

    if (!portfolioShifts[articleId]) {
      setPortfolioShifts((prev) => ({ ...prev, [articleId]: { loading: true } }));
      try {
        const res = await fetchPortfolioShift(timestamp, customHoldings.length > 0 ? customHoldings : undefined);
        if (res.isLive && res.data) {
          setPortfolioShifts((prev) => ({
            ...prev,
            [articleId]: { loading: false, shift: res.data?.portfolioShift, shifts: res.data?.shifts },
          }));
        } else {
          setPortfolioShifts((prev) => ({ ...prev, [articleId]: { loading: false, shift: 0 } }));
        }
      } catch {
        setPortfolioShifts((prev) => ({ ...prev, [articleId]: { loading: false, shift: 0 } }));
      }
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-end border-b border-[#30363D] pb-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">
            HOME SCREEN
          </h1>
          <p className="text-[#8B949E] text-[10px] font-mono uppercase tracking-[0.2em] mt-1">
            Asset Manager Dashboard // Ver 4.2.1
          </p>
        </div>
        <LiveStatusBadge
          isLive={isLive}
          isLoading={isDashLoading}
          lastUpdated={lastUpdated}
          error={dashError}
          onRefresh={refreshDash}
        />
      </div>

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-12 gap-5">

        {/* LEFT COLUMN: News Summariser & Portfolio */}
        <div className="col-span-12 lg:col-span-5 space-y-5">

          {/* Portfolio Summary Card */}
          <div className="card p-5">
            <h2 className="section-header mb-4">
              <span className="text-[#39FF14]">💼</span> Portfolio Snapshot
            </h2>
            {isPortfolioLoading && !portfolioLive ? (
              <div className="space-y-3">
                <div className="skeleton h-8 w-32" />
                <div className="skeleton h-4 w-48" />
              </div>
            ) : portfolioLive ? (
              <div>
                <div className="text-[10px] text-[#8B949E] uppercase tracking-wider mb-1">
                  Total Value
                </div>
                <div className="text-3xl font-bold text-white font-mono">
                  ${portfolioLive.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  className={`text-sm font-mono mt-1 ${portfolioLive.totalChange >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"
                    }`}
                >
                  {portfolioLive.totalChange >= 0 ? "▲" : "▼"}{" "}
                  ${Math.abs(portfolioLive.totalChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  ({portfolioLive.totalChangePct > 0 ? "+" : ""}{portfolioLive.totalChangePct.toFixed(2)}%)
                </div>
                <div className="text-xs text-[#8B949E] mt-4 pt-4 border-t border-[#30363D]">
                  Tracking {portfolioLive.holdings.length} assets.{" "}
                  <a href="/portfolio" className="text-[#39FF14] hover:underline ml-1">
                    Manage Portfolio ➔
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[#8B949E]">Loading portfolio data...</div>
            )}
          </div>

          {/* News Summariser */}
          <div className="card p-5 h-full max-h-[500px] flex flex-col">
            <h2 className="section-header mb-4">
              <span className="text-[#39FF14]">🧠</span> AI Market Briefing
            </h2>
            <div className="mt-2 text-sm text-[#C9D1D9] leading-relaxed overflow-y-auto whitespace-pre-wrap pr-2">
              {briefingText}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Real-Estate Heavy News Articles */}
        <div className="col-span-12 lg:col-span-7 card p-5 flex flex-col">
          <h2 className="section-header mb-4">
            <span className="text-[#39FF14]">📰</span> Live Market Intel Feed
            {isArticlesLive && (
              <span className="ml-2 text-[8px] text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 px-1.5 py-0.5 rounded">
                LIVE
              </span>
            )}
          </h2>
          <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2">
            {newsItems.map((news) => {
              const shiftData = portfolioShifts[news.id];
              const isExpanded = expandedArticle === news.id;

              return (
                <div
                  key={news.id}
                  className={`p-4 bg-[#0E1117] rounded-lg border ${isExpanded ? "border-[#39FF14]/50" : "border-[#30363D]"} hover:border-[#39FF14]/30 transition-all cursor-pointer`}
                  onClick={() => handleArticleClick(news.id, news.timestamp)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${news.sentiment === "BULLISH"
                          ? "badge-bullish"
                          : news.sentiment === "BEARISH"
                            ? "badge-bearish"
                            : "badge-neutral"
                          }`}
                      >
                        {news.sentiment}
                      </span>
                      <span className="theme-tag text-[9px] py-0.5">
                        {news.theme}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#8B949E] flex items-center gap-1">
                      {news.source} · {news.timeAgo}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white leading-tight mb-1">
                    {news.headline}
                  </h3>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#30363D] animate-fade-in">
                      <div className="text-xs text-[#8B949E] mb-3 leading-relaxed">
                        {news.summary}
                      </div>

                      <div className="bg-[#161B22] border border-[#30363D]/50 rounded p-3">
                        <h4 className="text-[10px] uppercase text-[#8B949E] tracking-wider mb-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-[#39FF14] rounded-full"></span>
                          Portfolio Impact Since Publication
                        </h4>

                        {shiftData?.loading ? (
                          <div className="flex space-x-2 animate-pulse">
                            <div className="h-4 w-1/4 bg-[#30363D] rounded"></div>
                            <div className="h-4 w-1/4 bg-[#30363D] rounded"></div>
                          </div>
                        ) : shiftData ? (
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-[#C9D1D9]">Overall Shift:</span>
                              <span className={`text-sm font-mono font-bold ${(shiftData.shift || 0) >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}>
                                {(shiftData.shift || 0) >= 0 ? "+" : ""}{(shiftData.shift || 0).toFixed(2)}%
                              </span>
                            </div>

                            {shiftData.shifts && Object.keys(shiftData.shifts).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(shiftData.shifts).map(([ticker, pct]) => (
                                  <div key={ticker} className="flex items-center text-[10px] bg-[#0E1117] border border-[#30363D] rounded px-2 py-1">
                                    <span className="text-[#8B949E] mr-1">{ticker}</span>
                                    <span className={`font-mono ${pct >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}>
                                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-[#8B949E]">Could not compute shift.</div>
                        )}
                      </div>
                      {news.link && (
                        <div className="mt-3 text-right">
                          <a href={news.link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#39FF14] hover:underline uppercase tracking-wide font-medium">Read Full Article ➔</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Events Ticker — LIVE */}
        <div className="col-span-12 card p-4 flex items-center overflow-hidden">
          <div className="section-header mr-6 whitespace-nowrap shrink-0">
            {isDashLive && dashboardLive?.alerts && dashboardLive.alerts.length > 0
              ? "🚨 Live Alerts"
              : "Recent Events"}
          </div>
          <div className="flex gap-8 overflow-x-auto pb-1">
            {events.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-3 whitespace-nowrap"
              >
                <span className="text-[#39FF14] font-mono text-xs">
                  {event.time}
                </span>
                <span className="text-sm font-semibold text-white">
                  {event.title}
                </span>
                <span
                  className={`px-2 py-0.5 text-[8px] rounded font-bold uppercase ${event.impact === "HIGH"
                    ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30"
                    : "bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30"
                    }`}
                >
                  {event.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}