"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { fetchSST, PortfolioInputItem } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import LiveStatusBadge from "@/components/LiveStatusBadge";

function getRegimeColor(regime: string): string {
    const r = regime.toLowerCase();
    if (r.includes("crisis")) return "#EF4444";
    if (r.includes("precarious")) return "#F59E0B";
    if (r.includes("growth")) return "#39FF14";
    if (r.includes("inflation")) return "#F59E0B";
    return "#8B949E";
}

export default function RiskImplicationPage() {
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

    // ─── Fetch live SST output from backend ──────────────────
    const sstFetcher = useCallback(() => fetchSST(customHoldings.length > 0 ? customHoldings : undefined), [customHoldings]);

    const {
        data: sstRes,
        isLive: isSstLive,
        isLoading,
        lastUpdated,
        error,
        refresh,
    } = usePolling<any>({
        fetcher: sstFetcher,
        interval: 60_000,
    });

    const regime = sstRes?.regime_output?.regime || "Neutral";
    const confidence = sstRes?.regime_output?.regime_confidence || 0;
    const portfolioImpact = sstRes?.portfolio_impact?.total_portfolio_impact || 0;

    return (
        <div className="p-6 lg:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex justify-between items-end border-b border-[#30363D] pb-5">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white uppercase">
                        Risk Implication
                    </h1>
                    <p className="text-[#8B949E] text-[10px] font-mono uppercase tracking-[0.2em] mt-1">
                        Cross-Asset Risk Engine // SST v3.0 Powered
                    </p>
                </div>
                <LiveStatusBadge
                    isLive={isSstLive}
                    isLoading={isLoading}
                    lastUpdated={lastUpdated}
                    error={error}
                    onRefresh={refresh}
                />
            </div>

            {/* MACRO REGIME BANNER */}
            <div
                className="p-6 rounded-xl border border-opacity-30 relative overflow-hidden"
                style={{
                    background: `linear-gradient(135deg, ${getRegimeColor(regime)}15 0%, #0E1117 100%)`,
                    borderColor: getRegimeColor(regime)
                }}
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div>
                        <div className="text-[10px] font-mono text-[#8B949E] uppercase tracking-widest mb-1">Detected Macro Regime</div>
                        <h2 className="text-3xl font-black text-white flex items-center gap-3">
                            {regime.replace("_Regime", "").toUpperCase()}
                            <span
                                className="text-[10px] px-2 py-0.5 rounded border"
                                style={{ color: getRegimeColor(regime), borderColor: `${getRegimeColor(regime)}40` }}
                            >
                                {Math.round(confidence * 100)}% CONFIDENCE
                            </span>
                        </h2>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-mono text-[#8B949E] uppercase tracking-widest mb-1">Portfolio Exposure Shift</div>
                        <div className={`text-3xl font-black ${portfolioImpact >= 0 ? "text-[#39FF14]" : "text-[#EF4444]"}`}>
                            {portfolioImpact > 0 ? "+" : ""}{portfolioImpact.toFixed(2)}%
                        </div>
                    </div>
                </div>
                {/* Background pulse effect */}
                <div
                    className="absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[100px] opacity-20"
                    style={{ background: getRegimeColor(regime) }}
                />
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* CROSS ASSET IMPACT HEATMAP */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    <div className="card p-5">
                        <h2 className="section-header mb-4">Cross-Asset Shock Impact Map</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            {sstRes?.cross_asset_impact?.visualizer?.map((f: any) => (
                                <div key={f.factor} className="bg-[#0E1117] border border-[#30363D] p-3 rounded-lg flex flex-col items-center">
                                    <span className="text-[10px] text-[#8B949E] uppercase font-mono mb-2">{f.factor.replace("_", " ")}</span>
                                    <div className={`text-xl font-bold ${f.shock > 0 ? "text-[#39FF14]" : f.shock < 0 ? "text-[#EF4444]" : "text-[#8B949E]"}`}>
                                        {f.shock > 0 ? "+" : ""}{f.shock.toFixed(1)}
                                    </div>
                                    <div
                                        className="w-full h-1 bg-[#161B22] mt-3 rounded-full overflow-hidden"
                                    >
                                        <div
                                            className="h-full"
                                            style={{
                                                width: `${Math.min(Math.abs(f.shock) * 33, 100)}%`,
                                                background: f.shock > 0 ? "#39FF14" : "#EF4444"
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SCENARIO LADDER */}
                    <div className="card p-5">
                        <h2 className="section-header mb-4">Scenario Ladder (Sensitivity)</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#30363D]">
                                        <th className="pb-3 font-mono text-[#8B949E]">SCENARIO</th>
                                        {sstRes?.cross_asset_impact?.visualizer?.map((f: any) => (
                                            <th key={f.factor} className="pb-3 font-mono text-[#8B949E] text-center">{f.factor.split("_")[0]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {["Baseline", "Moderate", "Severe"].map((level) => (
                                        <tr key={level} className="border-b border-[#161B22] last:border-0 hover:bg-white/[0.02]">
                                            <td className="py-4 font-bold text-white uppercase tracking-wider">{level}</td>
                                            {sstRes?.cross_asset_impact?.visualizer?.map((f: any) => {
                                                const mult = level === "Baseline" ? 0.5 : level === "Severe" ? 1.5 : 1.0;
                                                const val = f.shock * mult;
                                                return (
                                                    <td key={f.factor} className="py-4 text-center">
                                                        <span className={`px-2 py-1 rounded-md font-mono ${val > 0 ? "text-[#39FF14] bg-[#39FF14]/5" : val < 0 ? "text-[#EF4444] bg-[#EF4444]/5" : "text-[#8B949E]"}`}>
                                                            {val > 0 ? "+" : ""}{val.toFixed(2)}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* THEME TRACKER & RISK CONTRIBUTORS */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="card p-5">
                        <h2 className="section-header mb-4">Hottest Macro Themes</h2>
                        <div className="space-y-3">
                            {sstRes?.theme_tracker?.visualizer?.slice(0, 6).map((t: any) => (
                                <div key={t.theme} className="flex flex-col gap-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-[#C9D1D9] font-medium">{t.theme.replace("_", " ")}</span>
                                        <span className="text-[#8B949E] font-mono">{Math.round(t.probability * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-[#161B22] rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500"
                                            style={{
                                                width: `${t.probability * 100}%`,
                                                background: `linear-gradient(90deg, #1d4ed8 0%, #39FF14 ${t.probability * 100}%)`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card p-5">
                        <h2 className="section-header mb-4">Portfolio Risk Contributions</h2>
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-[10px] text-[#EF4444] font-bold uppercase tracking-widest mb-3">Top Vulnerabilities</h3>
                                <div className="space-y-2">
                                    {sstRes?.portfolio_impact?.risk_contributions?.top_negative_contributors?.map((c: any) => (
                                        <div key={c.ticker} className="flex items-center justify-between p-2.5 bg-[#EF4444]/5 border border-[#EF4444]/10 rounded-lg">
                                            <span className="text-xs font-bold text-[#EF4444]">{c.ticker}</span>
                                            <span className="text-xs font-mono text-[#EF4444]">{c.impact.toFixed(2)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest mb-3">Top Hedge Assets</h3>
                                <div className="space-y-2">
                                    {sstRes?.portfolio_impact?.risk_contributions?.top_positive_contributors?.map((c: any) => (
                                        <div key={c.ticker} className="flex items-center justify-between p-2.5 bg-[#39FF14]/5 border border-[#39FF14]/10 rounded-lg">
                                            <span className="text-xs font-bold text-[#39FF14]">{c.ticker}</span>
                                            <span className="text-xs font-mono text-[#39FF14]">+{c.impact.toFixed(2)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
