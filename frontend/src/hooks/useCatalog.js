import { useCallback, useEffect, useRef, useState } from "react";

import { api, invalidateApiCache } from "../lib/api.js";

/**
 * Reference tables and the real document index.
 *
 * The requests themselves are shared through the API cache and are
 * not tied to this component's lifetime. This hook owns only the
 * "should I still commit?" decision, which is why an aborted
 * request can never strand the panel in a permanent loading state.
 */
export function useCatalog() {
  const [state, setState] = useState({
    wells: [],
    events: [],
    documents: null,
    loading: true,
    error: null
  });

  const controllerRef = useRef(null);

  const load = useCallback(async ({ force = false } = {}) => {
    if (force) {
      invalidateApiCache("wells");
      invalidateApiCache("events");
      invalidateApiCache("documents");
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [wells, events, documents] = await Promise.all([
        api.wells(),
        api.events(),
        api.documents()
      ]);

      if (controller.signal.aborted) return;

      setState({
        wells: Array.isArray(wells) ? wells : [],
        events: Array.isArray(events) ? events : [],
        documents: documents ?? null,
        loading: false,
        error: null
      });
    } catch (error) {
      // Only a cancellation of *this* attempt is silent. An
      // AbortError from anything else is a genuine failure.
      if (controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message ?? "Reference data could not be retrieved."
      }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const reload = useCallback(() => load({ force: true }), [load]);

  const activeWell = useCallback(
    (wellId) => state.wells.find((w) => w.well_id === wellId) ?? null,
    [state.wells]
  );

  const eventsForWell = useCallback(
    (wellId) => state.events.filter((e) => e.well_id === wellId),
    [state.events]
  );

  return { ...state, reload, activeWell, eventsForWell };
}
