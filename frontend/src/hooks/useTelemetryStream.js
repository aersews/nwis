import { useCallback, useEffect, useRef, useState } from "react";

import { liveSocketUrl } from "../lib/api.js";

/* =========================================================
   LIVE TELEMETRY SOCKET
   ws://…/ws/live/{well_id}

   The backend replays a rolling window of the historical
   drilling record and closes the socket when the replay ends.
   We reconnect with a capped backoff, stop while the tab is
   hidden, and always close on unmount.
   ========================================================= */

const MAX_POINTS = 90;
const BACKOFF = [1500, 3000, 6000, 12000, 20000];

const normalise = (payload) => ({
  t: payload.timestamp ?? null,
  depth: typeof payload.depth === "number" ? payload.depth : null,
  rop: typeof payload.rop === "number" ? payload.rop : null,
  torque: typeof payload.torque === "number" ? payload.torque : null,
  ecd: typeof payload.ecd === "number" ? payload.ecd : null,
  pit_volume:
    typeof payload.pit_volume === "number" ? payload.pit_volume : null,
  wob: typeof payload.wob === "number" ? payload.wob : null,
  rpm: typeof payload.rpm === "number" ? payload.rpm : null,
  spp: typeof payload.spp === "number" ? payload.spp : null,
  flow_rate:
    typeof payload.flow_rate === "number" ? payload.flow_rate : null,
  risk: payload?.risk?.risk ?? null,
  riskLevel: payload?.risk?.risk_level ?? null,
  reasons: payload?.risk?.reasons ?? [],
  event: payload?.risk?.event ?? null
});

export function useTelemetryStream(wellId, { enabled = true } = {}) {
  const [status, setStatus] = useState("idle");
  const [points, setPoints] = useState([]);
  const [lastMessageAt, setLastMessageAt] = useState(null);
  const [reconnects, setReconnects] = useState(0);

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);
  const seriesRef = useRef([]);

  const push = useCallback((point) => {
    seriesRef.current = [...seriesRef.current, point].slice(-MAX_POINTS);
    setPoints(seriesRef.current);
    setLastMessageAt(Date.now());
  }, []);

  const reset = useCallback(() => {
    seriesRef.current = [];
    setPoints([]);
    setLastMessageAt(null);
    setReconnects(0);
  }, []);

  useEffect(() => {
    if (!enabled || !wellId) {
      setStatus("idle");
      return undefined;
    }

    aliveRef.current = true;
    attemptRef.current = 0;

    const connect = () => {
      if (!aliveRef.current) return;

      setStatus((prev) => (prev === "open" ? prev : "connecting"));

      let socket;
      try {
        socket = new WebSocket(liveSocketUrl(wellId));
      } catch {
        scheduleReconnect();
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        if (!aliveRef.current) return;
        attemptRef.current = 0;
        setStatus("open");
        setReconnects(0);
      };

      socket.onmessage = (event) => {
        if (!aliveRef.current) return;
        try {
          push(normalise(JSON.parse(event.data)));
        } catch {
          /* Ignore malformed frames rather than tearing down the link. */
        }
      };

      socket.onerror = () => {
        if (socketRef.current === socket) socketRef.current = null;
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (aliveRef.current) scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (!aliveRef.current) return;
      setStatus("reconnecting");
      setReconnects((n) => n + 1);

      const delay =
        BACKOFF[Math.min(attemptRef.current, BACKOFF.length - 1)];
      attemptRef.current += 1;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(connect, delay);
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current);
        socketRef.current?.close();
      } else if (!socketRef.current) {
        attemptRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    connect();

    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timerRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [wellId, enabled, push]);

  return { status, points, lastMessageAt, reconnects, reset };
}
