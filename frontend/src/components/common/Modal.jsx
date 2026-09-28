import { useCallback } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { IconClose } from "./Icons.jsx";

/**
 * Centred overlay for anything that needs the operator to read
 * a conclusion end-to-end: alert rationale, source documents,
 * well comparison, data provenance.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  severity = "none",
  tools,
  actions,
  children,
  wide = false,
  labelId = "modal-title"
}) {
  const handleClose = useCallback(() => onClose?.(), [onClose]);
  const ref = useFocusTrap(open, { onClose: handleClose });

  if (!open) return null;

  return (
    <>
      <div className="backdrop backdrop--modal" onClick={handleClose} role="presentation" />
      <div
        ref={ref}
        className={`modal${wide ? " modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        data-sev={severity}
      >
        <header className="modal__head">
          {eyebrow ? (
            <span className="modal__eyebrow">{eyebrow}</span>
          ) : null}
          <h2 id={labelId}>{title}</h2>
          <span className="panel__spacer" />
          {tools ? <div className="panel__tools">{tools}</div> : null}
          <button
            type="button"
            className="closebtn"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            <IconClose size={14} />
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {actions ? <footer className="modal__foot">{actions}</footer> : null}
      </div>
    </>
  );
}

export default Modal;
