"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { PortfolioInputItem } from "@/lib/api";
import { fetchPortfolio, PortfolioHolding, PortfolioResponse } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import LiveStatusBadge from "@/components/LiveStatusBadge";
import MiniSparkline from "@/components/MiniSparkline";

function formatCurrency(value: number): string {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
}

function formatVolume(vol: number): string {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
    return vol.toString();
}

function getSectorColor(sector: string): string {
    const colors: Record<string, string> = {
        Technology: "#3B82F6",
        Automotive: "#EF4444",
        Financials: "#F59E0B",
        Commodities: "#F97316",
        Energy: "#10B981",
        Bonds: "#8B5CF6",
        Index: "#06B6D4",
    };
    return colors[sector] || "#8B949E";
}

export default function PortfolioPage() {
    const [customHoldings, setCustomHoldings] = useState<PortfolioInputItem[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [newTicker, setNewTicker] = useState("");
    const [newQty, setNewQty] = useState("");

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

        window.addEventListener("portfolioUpdated", loadHoldings);
        window.addEventListener("storage", loadHoldings);

        return () => {
            window.removeEventListener("portfolioUpdated", loadHoldings);
            window.removeEventListener("storage", loadHoldings);
        };
    }, []);

    const saveHoldings = (items: PortfolioInputItem[]) => {
        setCustomHoldings(items);
        if (items.length > 0) {
            localStorage.setItem("customPortfolio", JSON.stringify(items));
        } else {
            localStorage.removeItem("customPortfolio");
        }
        window.dispatchEvent(new Event("portfolioUpdated"));
    };

    const handleAddAsset = () => {
        if (!newTicker || !newQty) return;
        const newItem: PortfolioInputItem = {
            ticker: newTicker.toUpperCase(),
            name: "Custom Asset",
            quantity: parseFloat(newQty) || 1,
            sector: "Unknown"
        };
        const updated = [...customHoldings.filter(h => h.ticker !== newItem.ticker), newItem];
        saveHoldings(updated);
        setNewTicker("");
        setNewQty("");
    };

    const handleRemoveAsset = (ticker: string) => {
        saveHoldings(customHoldings.filter(h => h.ticker !== ticker));
    };
    const fetcher = useCallback(() => fetchPortfolio(customHoldings.length > 0 ? customHoldings : undefined), [customHoldings]);

    const {
        data: portfolioData,
        isLive,
        isLoading,
        lastUpdated,
        error,
        refresh,
    } = usePolling<PortfolioResponse>({
        fetcher,
        interval: 60_000,
    });

    const holdings = portfolioData?.holdings || [];
    const totalValue = portfolioData?.totalValue || 0;
    const totalChange = portfolioData?.totalChange || 0;
    const totalChangePct = portfolioData?.totalChangePct || 0;

    // Sector allocation
    const sectorAlloc = useMemo(() => {
        if (!holdings.length) return [];
        const sectors: Record<string, number> = {};
        holdings.forEach((h) => {
            sectors[h.sector] = (sectors[h.sector] || 0) + h.holdingValue;
        });
        return Object.entries(sectors)
            .sort((a, b) => b[1] - a[1])
            .map(([sector, value]) => ({
                sector,
                value,
                pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
                color: getSectorColor(sector),
            }));
    }, [holdings, totalValue]);

    // Winners and losers
    const sortedByPct = useMemo(
        () => [...holdings].sort((a, b) => b.changePct - a.changePct),
        [holdings]
    );

    return (
        <div className="p-6 lg:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex justify-between items-end border-b border-[#30363D] pb-5">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">
                        PORTFOLIO TRACKER
                    </h1>
                    <p className="text-[#8B949E] text-[10px] font-mono uppercase tracking-[0.2em] mt-1">
                        Live Stock Prices & Holdings // yFinance Feed
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsEditing(!isEditing)} className="px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors border border-[#30363D] hover:border-[#39FF14] text-[#8B949E] hover:text-[#39FF14]">
                        {isEditing ? "Done Editing" : "Customize Portfolio"}
                    </button>
                    <LiveStatusBadge
                        isLive={isLive}
                        isLoading={isLoading}
                        lastUpdated={lastUpdated}
                        error={error}
                        onRefresh={refresh}
                    />
                </div>
            </div>

            {isEditing && (
                <div className="card p-5 mb-5 space-y-4 border-[#39FF14]/30 bg-[#39FF14]/5">
                    <h2 className="section-header text-[#39FF14]">⚙️ Edit Custom Portfolio</h2>
                    <p className="text-xs text-[#8B949E]">Add your own stocks here. If you clear all items, the system will revert to the default tracking portfolio.</p>
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-[10px] text-[#8B949E] uppercase mb-1">Ticker (e.g. NVDA)</label>
                            <input type="text" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#39FF14]" placeholder="NVDA" />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-[10px] text-[#8B949E] uppercase mb-1">Quantity</label>
                            <input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-full bg-[#0E1117] border border-[#30363D] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#39FF14]" placeholder="10" />
                        </div>
                        <button onClick={handleAddAsset} className="bg-[#39FF14]/20 hover:bg-[#39FF14]/30 text-[#39FF14] px-4 py-2 rounded text-sm font-bold transition-colors">
                            + Add Asset
                        </button>
                    </div>
                    {customHoldings.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#30363D]/50 flex flex-wrap gap-2">
                            {customHoldings.map(h => (
                                <div key={h.ticker} className="flex items-center bg-[#0E1117] border border-[#30363D] rounded px-3 py-1.5 text-xs text-white">
                                    <span className="font-bold mr-2">{h.ticker}</span>
                                    <span className="text-[#8B949E] mr-3">{h.quantity}</span>
                                    <button onClick={() => handleRemoveAsset(h.ticker)} className="text-[#EF4444] hover:text-white transition-colors">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* PORTFOLIO SUMMARY */}
            <div className="grid grid-cols-12 gap-5">
                {/* Total Value */}
                <div className="col-span-12 md:col-span-4">
                    <div className="card p-5">
                        <div className="text-[10px] text-[#8B949E] uppercase tracking-wider mb-1">
                            Total Portfolio Value
                        </div>
                        {isLoading ? (
                            <div className="skeleton h-10 w-48 mt-1" />
                        ) : (
                            <>
                                <div className="text-3xl font-bold text-white font-mono">
                                    {formatCurrency(totalValue)}
                                </div>
                                <div
                                    className={`text-sm font-mono mt-1 ${totalChange >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}
                                >
                                    {totalChange >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(totalChange))} ({totalChangePct >= 0 ? "+" : ""}{totalChangePct.toFixed(2)}%)
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Holdings count */}
                <div className="col-span-6 md:col-span-4">
                    <div className="card p-5">
                        <div className="text-[10px] text-[#8B949E] uppercase tracking-wider mb-1">
                            Active Holdings
                        </div>
                        {isLoading ? (
                            <div className="skeleton h-10 w-20 mt-1" />
                        ) : (
                            <div className="text-3xl font-bold text-white font-mono">
                                {holdings.length}
                            </div>
                        )}
                        <div className="text-[11px] text-[#8B949E] mt-1">
                            Across {sectorAlloc.length} sectors
                        </div>
                    </div>
                </div>

                {/* Top mover */}
                <div className="col-span-6 md:col-span-4">
                    <div className="card p-5">
                        <div className="text-[10px] text-[#8B949E] uppercase tracking-wider mb-1">
                            Top Mover Today
                        </div>
                        {isLoading || !sortedByPct.length ? (
                            <div className="skeleton h-10 w-32 mt-1" />
                        ) : (
                            <>
                                <div className="text-xl font-bold text-white font-mono">
                                    {sortedByPct[0].ticker}
                                </div>
                                <div
                                    className={`text-sm font-mono mt-1 ${sortedByPct[0].changePct >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}
                                >
                                    {sortedByPct[0].changePct >= 0 ? "+" : ""}{sortedByPct[0].changePct.toFixed(2)}%
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="grid grid-cols-12 gap-5">
                {/* Holdings Table — Left 8 cols */}
                <div className="col-span-12 lg:col-span-8">
                    <div className="card p-5">
                        <h2 className="section-header mb-4">
                            <span className="text-[#39FF14]">📈</span> Holdings
                            {isLive && (
                                <span className="ml-2 text-[8px] text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 px-1.5 py-0.5 rounded">
                                    LIVE
                                </span>
                            )}
                        </h2>

                        {isLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className="skeleton h-8 w-16" />
                                        <div className="skeleton h-8 flex-1" />
                                        <div className="skeleton h-8 w-20" />
                                        <div className="skeleton h-8 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[650px]">
                                    <thead>
                                        <tr className="text-[10px] text-[#8B949E] uppercase tracking-wider">
                                            <th className="text-left pb-3 font-medium">Asset</th>
                                            <th className="text-right pb-3 font-medium">Price</th>
                                            <th className="text-right pb-3 font-medium">Change</th>
                                            <th className="text-right pb-3 font-medium">Holdings</th>
                                            <th className="text-right pb-3 font-medium">Value</th>
                                            <th className="text-center pb-3 font-medium w-20">Trend</th>
                                            <th className="text-right pb-3 font-medium">Volume</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#30363D]/50">
                                        {holdings.map((h) => (
                                            <tr
                                                key={h.ticker}
                                                className="hover:bg-[#161B22]/50 transition-colors group"
                                            >
                                                {/* Asset */}
                                                <td className="py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="w-2 h-2 rounded-full shrink-0"
                                                            style={{ background: getSectorColor(h.sector) }}
                                                        />
                                                        <div>
                                                            <div className="text-sm font-semibold text-white group-hover:text-[#39FF14] transition-colors">
                                                                {h.ticker}
                                                            </div>
                                                            <div className="text-[10px] text-[#8B949E]">
                                                                {h.name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Price */}
                                                <td className="py-3 text-right">
                                                    <span className="text-sm font-mono text-white">
                                                        ${h.price.toFixed(2)}
                                                    </span>
                                                </td>

                                                {/* Change */}
                                                <td className="py-3 text-right">
                                                    <div
                                                        className={`text-sm font-mono font-semibold ${h.changePct >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}
                                                    >
                                                        {h.changePct >= 0 ? "+" : ""}{h.changePct.toFixed(2)}%
                                                    </div>
                                                    <div className={`text-[10px] font-mono ${h.change >= 0 ? "text-[#39FF14]/60" : "text-[#EF4444]/60"}`}>
                                                        {h.change >= 0 ? "+" : ""}${h.change.toFixed(2)}
                                                    </div>
                                                </td>

                                                {/* Holdings qty */}
                                                <td className="py-3 text-right">
                                                    <span className="text-sm font-mono text-[#C9D1D9]">
                                                        {h.quantity}
                                                    </span>
                                                </td>

                                                {/* Value */}
                                                <td className="py-3 text-right">
                                                    <span className="text-sm font-mono text-white font-semibold">
                                                        {formatCurrency(h.holdingValue)}
                                                    </span>
                                                </td>

                                                {/* Sparkline */}
                                                <td className="py-3">
                                                    <div className="flex justify-center">
                                                        {h.sparkline.length > 1 ? (
                                                            <MiniSparkline
                                                                data={h.sparkline}
                                                                color={h.changePct >= 0 ? "#39FF14" : "#EF4444"}
                                                                width={60}
                                                                height={24}
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] text-[#8B949E]">—</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Volume */}
                                                <td className="py-3 text-right">
                                                    <span className="text-xs font-mono text-[#8B949E]">
                                                        {formatVolume(h.volume)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar — Sector Allocation + Price Range */}
                <div className="col-span-12 lg:col-span-4 space-y-5">
                    {/* Sector Allocation */}
                    <div className="card p-5">
                        <h2 className="section-header mb-4">
                            <span className="text-[#39FF14]">🎯</span> Sector Allocation
                        </h2>
                        {isLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="skeleton h-6 w-full" />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sectorAlloc.map(({ sector, pct, color }) => (
                                    <div key={sector}>
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-sm"
                                                    style={{ background: color }}
                                                />
                                                <span className="text-[#C9D1D9]">{sector}</span>
                                            </span>
                                            <span className="font-mono text-[#8B949E]">
                                                {pct.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="h-2 bg-[#0E1117] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-700"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 52-Week Range */}
                    <div className="card p-5">
                        <h2 className="section-header mb-4">
                            <span className="text-[#39FF14]">📊</span> 52-Week Range
                        </h2>
                        {isLoading ? (
                            <div className="space-y-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="skeleton h-8 w-full" />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {holdings.filter(h => h.yearHigh > 0).map((h) => {
                                    const range = h.yearHigh - h.yearLow;
                                    const position = range > 0 ? ((h.price - h.yearLow) / range) * 100 : 50;
                                    return (
                                        <div key={h.ticker}>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="text-[#C9D1D9] font-semibold">{h.ticker}</span>
                                                <span className="text-[#8B949E] font-mono">
                                                    ${h.yearLow.toFixed(0)} — ${h.yearHigh.toFixed(0)}
                                                </span>
                                            </div>
                                            <div className="relative h-2 bg-[#0E1117] rounded-full">
                                                <div
                                                    className="absolute h-full rounded-full"
                                                    style={{
                                                        width: `${position}%`,
                                                        background: position > 70 ? "#39FF14" : position < 30 ? "#EF4444" : "#F59E0B",
                                                    }}
                                                />
                                                <div
                                                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white bg-[#161B22]"
                                                    style={{ left: `${Math.min(Math.max(position, 3), 97)}%`, transform: "translate(-50%, -50%)" }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Day Movers */}
                    <div className="card p-5">
                        <h2 className="section-header mb-3">
                            <span className="text-[#39FF14]">🔥</span> Day Movers
                        </h2>
                        {isLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="skeleton h-6 w-full" />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sortedByPct.map((h) => (
                                    <div
                                        key={h.ticker}
                                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#0E1117] transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-[10px] font-bold ${h.changePct >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}
                                            >
                                                {h.changePct >= 0 ? "▲" : "▼"}
                                            </span>
                                            <span className="text-xs font-semibold text-white">
                                                {h.ticker}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-xs font-mono font-bold ${h.changePct >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}
                                        >
                                            {h.changePct >= 0 ? "+" : ""}{h.changePct.toFixed(2)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
