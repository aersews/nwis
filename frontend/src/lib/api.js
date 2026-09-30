/* =========================================================
   NWIS — API CLIENT
   Thin fetch wrapper: timeouts, abortable, normalised
   errors, and a small TTL cache for reference data.
   Nothing here invents values — it only transports what
   the FastAPI backend returns.
   ========================================================= */

const RAW_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "" : "http://127.0.0.1:8000");

export const API_BASE = String(RAW_BASE).replace(/\/+$/, "");

export const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : window.location.origin.replace(/^http/, "ws");

export class ApiError extends Error {
  constructor(message, { status = 0, url = "", cause = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

const DEFAULT_TIMEOUT = 20_000;

async function request(
  path,
  { signal, timeout = DEFAULT_TIMEOUT, method = "GET" } = {}
) {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new ApiError("Request timed out", { url }));
  }, timeout);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new ApiError(
        `Backend responded ${response.status}`,
        { status: response.status, url }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error?.name === "AbortError") {
      // Distinguish caller-driven cancellation from timeout.
      if (signal?.aborted) throw error;
      throw new ApiError("The request timed out", { url, cause: error });
    }

    throw new ApiError(
      "Cannot reach the NWIS backend",
      { url, cause: error }
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ------------------------------------------------------------------
   Reference-data cache. These endpoints return static repository
   data, so one fetch per session is enough and avoids re-requesting
   the same tables on every panel mount.

   The cached promise deliberately carries no AbortSignal: it is
   shared, and a shared promise that one consumer can abort would
   reject for everybody. Consumers pass their own signal to decide
   whether to commit, not to control the fetch.
   ------------------------------------------------------------------ */

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

export function cached(key, loader, { force = false } = {}) {
  const hit = cache.get(key);
  const now = Date.now();

  if (!force && hit && now - hit.at < CACHE_TTL) return hit.promise;

  const promise = loader();
  cache.set(key, { at: now, promise });

  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });

  return promise;
}

export function invalidateApiCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearApiCache() {
  cache.clear();
}

/* ------------------------------------------------------------------
   Endpoints — all pre-existing routes, used as-is.
   ------------------------------------------------------------------ */

const json = (value) =>
  value === null || value === undefined || value === ""
    ? ""
    : encodeURIComponent(String(value));

export const api = {
  /**
   * Liveness probe. Prefers /api/status because a dev server
   * cannot proxy "/" without shadowing its own index document;
   * falls back to the original root route so an unmodified
   * backend still works.
   */
  system: async (opts) => {
    try {
      return await request("/api/status", opts);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return request("/", opts);
      }
      throw error;
    }
  },

  /* --- shared reference data (cached, not abortable) --- */
  wells: (opts = {}) =>
    cached(
      "wells",
      () => request("/api/wells", { timeout: opts.timeout ?? 15_000 })
    ),
  events: (opts = {}) =>
    cached(
      "events",
      () => request("/api/events", { timeout: opts.timeout ?? 15_000 })
    ),
  documents: (opts = {}) =>
    cached(
      "documents",
      () => request("/api/documents", { timeout: opts.timeout ?? 30_000 })
    ),
  wellEvents: (wellId, opts = {}) =>
    cached(
      `well-events:${wellId}`,
      () =>
        request(`/api/evidence/${json(wellId)}`, {
          timeout: opts.timeout ?? 15_000
        })
    ),

  /* --- request-scoped queries --- */
  offsets: (wellId, opts) =>
    request(`/api/wells/${json(wellId)}/offsets`, opts),
  depthRisk: (wellId, depth, radius, opts) =>
    request(
      `/api/risk/depth?well_id=${json(wellId)}&depth=${depth}&radius=${radius}`,
      opts
    ),
  ragSearch: (query, topK = 6, opts) =>
    request(`/api/rag/search?q=${json(query)}&top_k=${topK}`, {
      ...opts,
      timeout: 30_000
    }),
  document: (source, opts) =>
    request(`/api/documents/detail?source=${json(source)}`, opts),
  simulation: (wellId, step, opts) =>
    request(
      `/api/simulation/${json(wellId)}?step=${step}`,
      // The retrieval endpoints load the embedding model on first use
      // and that work is synchronous inside a single-process server,
      // so the first simulation call can queue behind it.
      { ...opts, timeout: 25_000 }
    ),
  nwis: (wellId, depth, opts) =>
    request(
      `/api/nwis/${json(wellId)}?depth=${depth}`,
      { ...opts, timeout: 30_000 }
    ),

  /* --- explainability --- */

  offsetDiagnostics: (wellId, opts) =>
    request(
      `/api/wells/${json(wellId)}/offset-diagnostics`,
      opts
    ),
  riskContributors: (wellId, depth, opts) =>
    request(
      `/api/risk/contributors?well_id=${json(wellId)}&depth=${depth}`,
      { ...opts, timeout: 25_000 }
    ),
  riskModel: (opts) => request("/api/risk/model", opts),
  whyNow: (wellId, depth, opts) =>
    request(
      `/api/why-now/${json(wellId)}?depth=${depth}`,
      { ...opts, timeout: 25_000 }
    ),

  /* --- alert lifecycle (live state, never cached) --- */

  alerts: (wellId, opts) =>
    request(
      wellId
        ? `/api/alerts?well_id=${json(wellId)}`
        : "/api/alerts",
      opts
    ),
  alertState: (alertId, state, opts) =>
    request(
      `/api/alerts/${json(alertId)}/state?state=${json(state)}`,
      { ...opts, method: "POST" }
    ),

  /* --- evaluation and claim audit --- */

  claimAudit: (opts) => request("/api/claim-audit", opts),
  evaluation: (opts) =>
    request("/api/evaluation", { ...opts, timeout: 25_000 }),
  replay: (opts) =>
    request("/api/evaluation/replay", {
      ...opts,
      timeout: 25_000
    }),
  retrievalConfig: (opts) =>
    request("/api/retrieval/config", opts)
};

export const liveSocketUrl = (wellId) =>
  `${WS_BASE}/ws/live/${json(wellId)}`;
