"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
    {
        label: "Dashboard",
        href: "/",
        icon: (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
    },
    {
        label: "Portfolio",
        href: "/portfolio",
        icon: (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
        ),
    },
    {
        label: "AI News",
        href: "/news",
        icon: (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
        ),
    },
    {
        label: "Heatmap",
        href: "/heatmap",
        icon: (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
        ),
    },
    {
        label: "Risk Implication",
        href: "/risk-implication",
        icon: (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        ),
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className={`${collapsed ? "w-[68px]" : "w-[240px]"} border-r border-[#30363D] bg-[#0E1117] flex flex-col transition-all duration-300 ease-in-out shrink-0`}
            style={{ minHeight: "100vh" }}
        >
            {/* Logo + Collapse */}
            <div className="flex items-center justify-between p-5 pb-8">
                <div className={`flex items-center gap-2 ${collapsed ? "justify-center w-full" : ""}`}>
                    <span className="text-xl font-black tracking-tighter text-white">
                        FT
                    </span>
                    {!collapsed && (
                        <span className="text-[9px] text-[#39FF14] border border-[#39FF14] px-1.5 py-0.5 rounded font-bold tracking-wider">
                            PRO
                        </span>
                    )}
                </div>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="text-[#8B949E] hover:text-[#C9D1D9] transition-colors"
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <svg
                        width="16"
                        height="16"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-1 px-3">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group
                ${isActive
                                    ? "bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/20"
                                    : "text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#161B22] border border-transparent"
                                }
                ${collapsed ? "justify-center px-2" : ""}
              `}
                            title={collapsed ? item.label : undefined}
                        >
                            <span className={`shrink-0 ${isActive ? "text-[#39FF14]" : "text-[#8B949E] group-hover:text-[#C9D1D9]"}`}>
                                {item.icon}
                            </span>
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Area */}
            <div className="mt-auto p-4">
                {!collapsed && (
                    <div className="text-[10px] font-mono text-[#8B949E] space-y-1 border-t border-[#30363D] pt-4">
                        <div>
                            ENGINE: <span className="text-[#39FF14]">ONLINE</span>
                        </div>
                        <div>
                            PIPELINE: <span className="text-[#39FF14]">ACTIVE</span>
                        </div>
                        <div className="text-[#30363D]">v4.2.1</div>
                    </div>
                )}
            </div>
        </aside>
    );
}
