"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
    heatmapData as mockHeatmapData,
    heatmapDays as mockHeatmapDays,
    timelineEvents as mockTimelineEvents,
} from "@/data/mockData";
import {
    fetchHeatmap,
    fetchTimeline,
    transformTimelineToHeatmapMatrix,
    BackendTimelineSnapshot,
    PortfolioInputItem,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import LiveStatusBadge from "@/components/LiveStatusBadge";

function getHeatColor(value: number): string {
    if (value >= 60) return "rgba(57, 255, 20, 0.85)";
    if (value >= 30) return "rgba(57, 255, 20, 0.55)";
    if (value >= 10) return "rgba(57, 255, 20, 0.3)";
    if (value >= -10) return "rgba(139, 148, 158, 0.2)";
    if (value >= -30) return "rgba(239, 68, 68, 0.3)";
    if (value >= -60) return "rgba(239, 68, 68, 0.55)";
    return "rgba(239, 68, 68, 0.85)";
}

function getTextColor(value: number): string {
    if (Math.abs(value) > 50) return "#FFFFFF";
    return "#C9D1D9";
}

function getCategoryColor(category: string): string {
    switch (category) {
        case "HIGH":
            return "#EF4444";
        case "MEDIUM":
            return "#F59E0B";
        case "LOW":
            return "#39FF14";
        default:
            return "#8B949E";
    }
}

export default function HeatmapPage() {
    const [hoveredCell, setHoveredCell] = useState<{
        theme: string;
        colIdx: number;
        value: number;
    } | null>(null);
    const [customHoldings, setCustomHoldings] = useState<PortfolioInputItem[]>([]);

    // ─── Load custom portfolio from local storage ────────────────
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
        window.addEventListener("portfolioUpdated", loadHoldings);
        window.addEventListener("storage", loadHoldings);
        return () => {
            window.removeEventListener("portfolioUpdated", loadHoldings);
            window.removeEventListener("storage", loadHoldings);
        };
    }, []);

    // ─── Live data polling ───────────────────────────────────
    const heatmapFetcher = useCallback(() => fetchHeatmap(customHoldings.length > 0 ? customHoldings : undefined), [customHoldings]);
    const timelineFetcher = useCallback(() => fetchTimeline(), []);

    const {
        data: heatmapLive,
        isLive: isHeatmapLive,
        isLoading,
        lastUpdated,
        error,
        refresh,
    } = usePolling<{ heatmap: Record<string, number> }>({
        fetcher: heatmapFetcher,
        interval: 30_000,
    });

    const {
        data: timelineLive,
        isLive: isTimelineLive,
    } = usePolling<{ timeline: BackendTimelineSnapshot[] }>({
        fetcher: timelineFetcher,
        interval: 30_000,
    });

    const isLive = isHeatmapLive || isTimelineLive;

    // ─── Transform data ──────────────────────────────────────
    const { matrixDays, matrixRows } = useMemo(() => {
        if (heatmapLive?.heatmap && timelineLive?.timeline && timelineLive.timeline.length > 0) {
            const transformed = transformTimelineToHeatmapMatrix(
                timelineLive.timeline,
                heatmapLive.heatmap
            );
            return { matrixDays: transformed.days, matrixRows: transformed.rows };
        }
        // Fallback: if we have heatmap but no timeline, show single-column with live scores
        if (heatmapLive?.heatmap) {
            const themes = Object.keys(heatmapLive.heatmap);
            return {
                matrixDays: ["Now"],
                matrixRows: themes.map((theme) => ({
                    theme,
                    cells: [{
                        value: Math.max(-100, Math.min(100, Math.round(heatmapLive.heatmap[theme] * 10))),
                    }],
                })),
            };
        }
        return { matrixDays: mockHeatmapDays, matrixRows: mockHeatmapData };
    }, [heatmapLive, timelineLive]);

    // Timeline events from backend snapshots or mock
    const timelineEvents = useMemo(() => {
        if (timelineLive?.timeline && timelineLive.timeline.length > 0) {
            return timelineLive.timeline.slice(-9).reverse().map((snapshot, i) => {
                const scores = Object.entries(snapshot.scores);
                const topTheme = scores.sort((a, b) => b[1] - a[1])[0];
                const score = topTheme ? topTheme[1] : 0;

                let date = snapshot.timestamp;
                try {
                    const d = new Date(snapshot.timestamp);
                    date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                } catch { }

                return {
                    date,
                    title: topTheme ? topTheme[0] : "Snapshot",
                    category: (score > 5 ? "HIGH" : score > 2 ? "MEDIUM" : "LOW") as "HIGH" | "MEDIUM" | "LOW",
                    icon: score > 5 ? "🔴" : score > 2 ? "🟡" : "🟢",
                };
            });
        }
        return mockTimelineEvents;
    }, [timelineLive]);

    return (
        <div className="p-6 lg:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex justify-between items-end border-b border-[#30363D] pb-5">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">
                        MACRO THEME HEATMAP
                    </h1>
                    <p className="text-[#8B949E] text-[10px] font-mono uppercase tracking-[0.2em] mt-1">
                        Trend Intensity & Economic Timeline // {isLive ? "Live Data" : "7-Day View"}
                    </p>
                </div>
                <LiveStatusBadge
                    isLive={isLive}
                    isLoading={isLoading}
                    lastUpdated={lastUpdated}
                    error={error}
                    onRefresh={refresh}
                />
            </div>

            {/* HEATMAP MATRIX */}
            <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="section-header">
                        <span className="text-[#39FF14]">🔥</span> Theme Heat Score Matrix
                        {isHeatmapLive && (
                            <span className="ml-2 text-[8px] text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 px-1.5 py-0.5 rounded">
                                LIVE
                            </span>
                        )}
                    </h2>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-[10px] text-[#8B949E]">
                        <span className="flex items-center gap-1.5">
                            <span>Intensity:</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span
                                className="w-3 h-3 rounded-sm"
                                style={{ background: "rgba(239, 68, 68, 0.85)" }}
                            />
                            Strong Bearish
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span
                                className="w-3 h-3 rounded-sm"
                                style={{ background: "rgba(239, 68, 68, 0.35)" }}
                            />
                            Mild Bearish
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span
                                className="w-3 h-3 rounded-sm"
                                style={{ background: "rgba(57, 255, 20, 0.35)" }}
                            />
                            Mild Bullish
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span
                                className="w-3 h-3 rounded-sm"
                                style={{ background: "rgba(57, 255, 20, 0.85)" }}
                            />
                            Strong Bullish
                        </span>
                    </div>
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} className="flex gap-2">
                                <div className="skeleton h-10 w-32" />
                                {Array.from({ length: 7 }).map((_, j) => (
                                    <div key={j} className="skeleton h-10 flex-1" />
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                            <thead>
                                <tr>
                                    <th className="text-left text-[11px] font-medium text-[#8B949E] pb-3 pr-4 w-36"></th>
                                    {matrixDays.map((day, dayIdx) => (
                                        <th
                                            key={`day-${dayIdx}`}
                                            className="text-center text-[11px] font-medium text-[#8B949E] pb-3 px-1"
                                        >
                                            {day}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixRows.map((row) => (
                                    <tr key={row.theme}>
                                        <td className="text-[13px] font-medium text-[#C9D1D9] pr-4 py-1.5 whitespace-nowrap">
                                            {row.theme}
                                        </td>
                                        {row.cells.map((cell, colIdx) => (
                                            <td key={colIdx} className="p-1">
                                                <div
                                                    className="heat-cell relative"
                                                    style={{
                                                        background: getHeatColor(cell.value),
                                                        color: getTextColor(cell.value),
                                                        height: "44px",
                                                        minWidth: "70px",
                                                    }}
                                                    onMouseEnter={() =>
                                                        setHoveredCell({
                                                            theme: row.theme,
                                                            colIdx,
                                                            value: cell.value,
                                                        })
                                                    }
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                >
                                                    {cell.value > 0 ? `+${cell.value}` : cell.value}

                                                    {hoveredCell &&
                                                        hoveredCell.theme === row.theme &&
                                                        hoveredCell.colIdx === colIdx && (
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1e2530] border border-[#30363D] rounded-lg px-3 py-2 text-[11px] whitespace-nowrap z-50 shadow-xl">
                                                                <div className="text-white font-semibold">
                                                                    {row.theme}
                                                                </div>
                                                                <div className="text-[#8B949E]">
                                                                    {matrixDays[colIdx]} · Score:{" "}
                                                                    <span
                                                                        className={
                                                                            cell.value >= 0
                                                                                ? "text-[#39FF14]"
                                                                                : "text-[#EF4444]"
                                                                        }
                                                                    >
                                                                        {cell.value > 0
                                                                            ? `+${cell.value}`
                                                                            : cell.value}
                                                                    </span>
                                                                </div>
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#30363D]" />
                                                            </div>
                                                        )}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ECONOMIC EVENT TIMELINE */}
            <div className="card p-5">
                <h2 className="section-header mb-6">
                    <span className="text-[#39FF14]">⏱️</span> Economic Event Timeline
                    {isTimelineLive && (
                        <span className="ml-2 text-[8px] text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 px-1.5 py-0.5 rounded">
                            LIVE SNAPSHOTS
                        </span>
                    )}
                </h2>

                <div className="overflow-x-auto pb-4">
                    <div className="flex items-start gap-0 min-w-[800px]">
                        {timelineEvents.map((event, index) => (
                            <div
                                key={index}
                                className="flex flex-col items-center flex-1 min-w-[90px] relative"
                            >
                                {index < timelineEvents.length - 1 && (
                                    <div
                                        className="absolute top-[22px] left-[50%] right-0 h-[2px] bg-[#30363D]"
                                        style={{
                                            width: "100%",
                                            left: "50%",
                                        }}
                                    />
                                )}

                                <div
                                    className="w-11 h-11 rounded-full flex items-center justify-center text-lg mb-3 relative z-10 border-2 transition-all hover:scale-110 cursor-pointer"
                                    style={{
                                        background: "#161B22",
                                        borderColor: getCategoryColor(event.category),
                                        boxShadow: `0 0 12px ${getCategoryColor(event.category)}33`,
                                    }}
                                >
                                    {event.icon}
                                </div>

                                <div className="text-[11px] font-mono text-[#C9D1D9] font-semibold mb-1">
                                    {event.date}
                                </div>

                                <div className="text-[10px] text-[#8B949E] text-center leading-tight max-w-[80px]">
                                    {event.title}
                                </div>

                                <div
                                    className="mt-2 px-2 py-0.5 rounded text-[8px] font-bold uppercase"
                                    style={{
                                        color: getCategoryColor(event.category),
                                        background: `${getCategoryColor(event.category)}15`,
                                        border: `1px solid ${getCategoryColor(event.category)}30`,
                                    }}
                                >
                                    {event.category}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
