import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api.js";

/* =========================================================
   UNIFIED NWIS INTELLIGENCE
   GET /api/nwis/{well_id}?depth={depth}

   Refetch policy: one request per 10 m of depth advance,
   debounced. During a fast demo this turns ~12 requests into
   2 while keeping the panel exactly in step with the bit.
   ========================================================= */

const DEPTH_BUCKET = 10;
const SETTLE_MS = 450;

export function useNwisIntelligence(wellId, depth, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(enabled ? "loading" : "idle");
  const [lastUpdated, setLastUpdated] = useState(null);

  const controllerRef = useRef(null);
  const requestedRef = useRef(null);
  const [retryToken, setRetryToken] = useState(0);

  const bucket =
    Number.isFinite(depth) && depth !== null
      ? Math.round(depth / DEPTH_BUCKET)
      : null;

  const key = wellId && bucket !== null ? `${wellId}@${bucket}` : null;

  useEffect(() => {
    if (!enabled || !key) {
      setStatus("idle");
      return undefined;
    }

    if (requestedRef.current === key) return undefined;

    const controller = new AbortController();
    controllerRef.current = controller;
    let timer = null;

    setStatus((prev) => (prev === "ready" ? "refreshing" : "loading"));
    setError(null);

    timer = setTimeout(async () => {
      try {
        const payload = await api.nwis(wellId, depth, {
          signal: controller.signal
        });

        if (controller.signal.aborted) return;
        if (!payload || !payload.risk) {
          throw new Error("Malformed intelligence payload");
        }

        setData(payload);
        setStatus("ready");
        setLastUpdated(Date.now());
        requestedRef.current = key;
      } catch (err) {
        if (err?.name === "AbortError") return;
        setError(err?.message ?? "Intelligence request failed");
        setStatus("error");
        // Allow a retry of the same bucket.
        requestedRef.current = null;
      }
    }, SETTLE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, wellId, depth, enabled, retryToken]);

  useEffect(() => {
    requestedRef.current = null;
    setData(null);
    setError(null);
    setStatus(enabled ? "loading" : "idle");
  }, [wellId, enabled]);

  const retry = useCallback(() => {
    requestedRef.current = null;
    setRetryToken((t) => t + 1);
  }, []);

  return {
    data,
    error,
    loading: status === "loading",
    refreshing: status === "refreshing",
    status,
    lastUpdated,
    retry
  };
}
