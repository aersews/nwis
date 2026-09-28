import { useCallback } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { IconClose } from "./Icons.jsx";

function Stop({ onClick }) {
  return (
    <div
      className="backdrop"
      onClick={onClick}
      role="presentation"
    />
  );
}

/**
 * Right-side context drawer. Used for offset-well intelligence
 * so the map and the risk panel stay visible behind it.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  badges,
  actions,
  children,
  wide = false,
  labelId
}) {
  const handleClose = useCallback(() => onClose?.(), [onClose]);
  const ref = useFocusTrap(open, { onClose: handleClose });

  if (!open) return null;

  return (
    <>
      <Stop onClick={handleClose} />
      <aside
        ref={ref}
        className={`drawer${wide ? " drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId ?? "drawer-title"}
      >
        <header className="drawer__head">
          <div className="drawer__title">
            {eyebrow ? (
              <span className="label" style={{ color: "var(--sev, var(--text-faint))" }}>
                {eyebrow}
              </span>
            ) : null}
            <h2 id={labelId ?? "drawer-title"}>{title}</h2>
            {badges?.length ? (
              <div className="drawer__sub">{badges}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="closebtn"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <IconClose size={14} />
          </button>
        </header>

        <div className="drawer__body">{children}</div>

        {actions ? <footer className="drawer__foot">{actions}</footer> : null}
      </aside>
    </>
  );
}

export default Drawer;
