import { memo } from "react";

import { severityKey } from "../../lib/risk.js";

/**
 * Severity chip. Colour is never the only signal — the level
 * word is always rendered next to the dot.
 */
function BadgeBase({
  children,
  severity,
  level,
  plain = false,
  large = false,
  dot = true,
  pulse = false,
  title,
  className = ""
}) {
  const text = children ?? level;
  const key = severity ?? severityKey(level);

  if (text === null || text === undefined || text === "") return null;

  return (
    <span
      className={[
        "badge",
        plain ? "badge--plain" : "",
        large ? "badge--lg" : "",
        pulse ? "badge--pulse" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      data-sev={key}
      title={title}
    >
      {dot ? <i className="badge__dot" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}

export const Badge = memo(BadgeBase);

/** Confidence chip — deliberately uses the information hue, not a risk hue. */
export const ConfidenceBadge = memo(function ConfidenceBadge({ value }) {
  if (!value) return null;
  const key = String(value).toLowerCase() === "low" ? "low" : "info";
  return <Badge severity={key} dot={false}>{`Confidence ${String(value).toUpperCase()}`}</Badge>;
});

export default Badge;
