import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/**
 * Leaflet caches the container size, so a panel that reflows
 * (drawer opening, window resize, responsive breakpoint) can
 * leave grey wedges at the edges. This keeps the map honest.
 */
export function MapResizer({ deps = [] }) {
  const map = useMap();
  const frame = useRef(null);
  const key = deps.join("|");

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return undefined;

    const invalidate = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => map.invalidateSize());
    };

    invalidate();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", invalidate);
      return () => window.removeEventListener("resize", invalidate);
    }

    const observer = new ResizeObserver(invalidate);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
    };
    // `key` carries the data-driven invalidations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}

/** Centres and zooms to the active well, once, when it changes. */
export function MapFocus({ center, zoom, trigger }) {
  const map = useMap();
  const first = useRef(true);

  useEffect(() => {
    if (!center) return;
    if (first.current && trigger === "init") {
      map.setView(center, zoom, { animate: false });
      first.current = false;
      return;
    }
    map.setView(center, zoom);
    // Only re-run when the operator asks for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);

  return null;
}

/** Fits every supplied coordinate inside the viewport. */
export function MapFit({ points, trigger }) {
  const map = useMap();

  useEffect(() => {
    if (!trigger) return;
    if (!points || points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 12, { animate: true });
      return;
    }

    const bounds = points.map((p) => p);
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 12, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);

  return null;
}
