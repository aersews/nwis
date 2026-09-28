import { useCallback, useEffect, useRef, useState } from "react";

/* =========================================================
   Small, dependency-free hooks shared across the shell.
   ========================================================= */

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Debounced callback with a stable identity and guaranteed cleanup. */
export function useDebouncedCallback(callback, delay = 300) {
  const ref = useRef(callback);
  const timer = useRef(null);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(
    (...args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => ref.current(...args), delay);
    },
    [delay]
  );
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsomorphicId(prefix) {
  const [id] = useState(() =>
    `${prefix}-${Math.random().toString(36).slice(2, 10)}`
  );
  return id;
}

/** Tracks which section is currently on screen for the section rail. */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0.01 }
    );

    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

/**
 * Measures an element so SVG charts can be drawn at true pixel
 * size. Charts are the only place the UI needs real geometry —
 * everything else is CSS.
 */
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function useScrollToSection() {
  return useCallback((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start"
    });
    // Move focus so keyboard and screen-reader users follow the jump.
    node.setAttribute("tabindex", "-1");
    node.focus({ preventScroll: true });
  }, []);
}
