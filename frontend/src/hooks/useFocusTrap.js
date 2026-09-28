import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

/**
 * Overlay stack. When a modal opens on top of a drawer, one Escape
 * must close exactly one layer, so only the topmost trap may react.
 */
const overlayStack = [];

function isTopmost(id) {
  return overlayStack[overlayStack.length - 1] === id;
}

let overlaySeq = 0;

/**
 * Traps focus inside an overlay, restores it on close and
 * supports Escape. Used by both the drawer and the modal so
 * keyboard behaviour is identical everywhere.
 *
 * The close handler is held in a ref so the listeners are
 * registered exactly once per open overlay. Re-registering on
 * every render would churn focus and can drop a keypress.
 */
export function useFocusTrap(active, { onClose, autoFocus = true } = {}) {
  const containerRef = useRef(null);
  const restoreRef = useRef(null);
  const closeRef = useRef(onClose);
  const idRef = useRef(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;

    if (idRef.current === null) {
      overlaySeq += 1;
      idRef.current = overlaySeq;
    }
    const id = idRef.current;

    restoreRef.current = document.activeElement;
    overlayStack.push(id);

    const node = containerRef.current;
    if (node && autoFocus) {
      const first = node.querySelector(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (!isTopmost(id)) return;
        event.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !containerRef.current) return;
      if (!isTopmost(id)) return;

      const items = Array.from(
        containerRef.current.querySelectorAll(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);

      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const at = overlayStack.lastIndexOf(id);
      if (at !== -1) overlayStack.splice(at, 1);
      document.body.style.overflow =
        overlayStack.length > 0 ? "hidden" : previousOverflow;
      const restore = restoreRef.current;
      if (restore instanceof HTMLElement && document.contains(restore)) {
        restore.focus({ preventScroll: true });
      }
    };
  }, [active, autoFocus]);

  return containerRef;
}
