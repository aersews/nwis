import { Component } from "react";

import { IconAlert } from "./Icons.jsx";

/**
 * Panel-level containment.
 *
 * A render fault inside one intelligence panel must not blank the
 * command centre — the operator still needs the risk state, the
 * map and the alert timeline. Every major region is wrapped so a
 * failure degrades to a labelled, reportable placeholder instead of
 * a white screen.
 */
export class PanelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surfaced deliberately: this is a defect, not a data condition.
    console.error(
      `[NWIS] ${this.props.label ?? "panel"} failed to render:`,
      error,
      info?.componentStack
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { label: name = "This panel", onRetry } = this.props;

    return (
      <div className="state state--error state--inline" role="alert">
        <span className="state__icon" aria-hidden="true">
          <IconAlert size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="state__title">{name} could not be displayed</p>
          <p className="state__text">
            The rest of the command centre is unaffected. This is an
            interface fault, not a data outage.
          </p>
          {onRetry ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: "flex-start", marginTop: "var(--s-3)" }}
              onClick={() => {
                this.setState({ error: null });
                onRetry();
              }}
            >
              Reload panel
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}

export default PanelBoundary;
