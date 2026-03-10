"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UsePollingOptions<T> {
    /** Async function that fetches data */
    fetcher: () => Promise<{ data: T | null; error: string | null; isLive: boolean }>;
    /** Polling interval in ms (default 30s) */
    interval?: number;
    /** Whether to poll automatically */
    enabled?: boolean;
    /** Fallback data if API fails */
    fallback?: T;
}

interface UsePollingResult<T> {
    data: T | null;
    error: string | null;
    isLive: boolean;
    isLoading: boolean;
    lastUpdated: Date | null;
    refresh: () => void;
}

/**
 * React hook for polling backend data with automatic fallback.
 * Shows a live/mock indicator and handles loading states.
 */
export function usePolling<T>({
    fetcher,
    interval = 30_000,
    enabled = true,
    fallback,
}: UsePollingOptions<T>): UsePollingResult<T> {
    const [data, setData] = useState<T | null>(fallback || null);
    const [error, setError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const fetchIdRef = useRef(0);

    const fetchData = useCallback(async () => {
        const fetchId = ++fetchIdRef.current;
        try {
            const result = await fetcher();

            // Prevent race condition: only process the most recent fetch
            if (fetchId !== fetchIdRef.current) return;

            if (result.data) {
                setData(result.data);
                setIsLive(result.isLive);
                setError(null);
                setLastUpdated(new Date());
            } else {
                // API failed — use fallback if available
                setError(result.error);
                setIsLive(false);
                if (fallback && !data) {
                    setData(fallback);
                }
            }
        } catch (err: any) {
            if (fetchId !== fetchIdRef.current) return;

            setError(err.message || "Unknown error");
            setIsLive(false);
            if (fallback && !data) {
                setData(fallback);
            }
        } finally {
            if (fetchId === fetchIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [fetcher, fallback]);

    useEffect(() => {
        if (!enabled) return;

        // Initial fetch
        fetchData();

        // Set up polling
        intervalRef.current = setInterval(fetchData, interval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchData, interval, enabled]);

    const refresh = useCallback(() => {
        setIsLoading(true);
        fetchData();
    }, [fetchData]);

    return { data, error, isLive, isLoading, lastUpdated, refresh };
}
