import { memo } from "react";

import {
  IconAlert,
  IconDatabase,
  IconSearch
} from "./Icons.jsx";

/* =========================================================
   SYSTEM STATES
   Every API-backed region renders one of these instead of
   an empty box, so a slow or broken source is always visible
   and always recoverable.
   ========================================================= */

export function LoadingState({ label: text = "Loading", className = "" }) {
  return (
    <div className={`loading ${className}`.trim()} role="status">
      <i className="loading__spin" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function Skeleton({ width = "100%", height, style, className = "" }) {
  return (
    <i
      className={`skeleton ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 4, columns = [1, 0.5, 0.28] }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }).map((_, row) => (
        <div
          className="skeleton-row"
          key={row}
          style={{
            gridTemplateColumns: columns
              .map((c) => (c > 0 ? `${c}fr` : `${c * 200}px`))
              .join(" ")
          }}
        >
          {columns.map((c, col) => (
            <Skeleton
              key={col}
              width={c > 0 ? "100%" : `${c * 200}px`}
              height={9}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Data source unavailable",
  message,
  onRetry,
  retryLabel = "Retry",
  compact = false,
  icon
}) {
  return (
    <div className={`state state--error${compact ? " state--tight" : ""}`} role="alert">
      <span className="state__icon" aria-hidden="true">
        {icon ?? <IconAlert size={16} />}
      </span>
      <p className="state__title">{title}</p>
      {message ? <p className="state__text">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title = "Nothing to show",
  message,
  action,
  severity = "none",
  compact = false,
  icon
}) {
  return (
    <div
      className={`state${compact ? " state--tight" : ""}`}
      data-sev={severity}
    >
      <span className="state__icon" aria-hidden="true">
        {icon ?? <IconDatabase size={16} />}
      </span>
      <p className="state__title">{title}</p>
      {message ? <p className="state__text">{message}</p> : null}
      {action}
    </div>
  );
}

export function NoResultsState({ query, onClear }) {
  return (
    <EmptyState
      severity="info"
      icon={<IconSearch size={16} />}
      title="No matching intelligence"
      message={
        query
          ? `Nothing in wells, events or the document index matched “${query}”.`
          : "Nothing to search yet."
      }
      action={
        onClear ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear search
          </button>
        ) : null
      }
    />
  );
}

export const MemoErrorState = memo(ErrorState);
export default LoadingState;
