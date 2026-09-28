import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api.js";

/**
 * Liveness of the backend, polled from GET /.
 * Drives the SYSTEM ONLINE indicator only — it never gates
 * the rest of the dashboard.
 */
export function useSystemStatus({ intervalMs = 25000 } = {}) {
  const [state, setState] = useState({
    status: "unknown",
    mode: null,
    note: null,
    checkedAt: null,
    reachable: false
  });

  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const load = async () => {
      try {
        const data = await api.system({ timeout: 6000 });
        if (!aliveRef.current) return;
        setState({
          status: data?.status ?? "unknown",
          mode: data?.mode ?? null,
          note: data?.note ?? null,
          system: data?.system ?? null,
          version: data?.version ?? null,
          checkedAt: Date.now(),
          reachable: true
        });
      } catch {
        if (!aliveRef.current) return;
        setState((prev) => ({
          ...prev,
          status: "offline",
          checkedAt: Date.now(),
          reachable: false
        }));
      }
    };

    load();
    const timer = setInterval(load, intervalMs);

    return () => {
      aliveRef.current = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
