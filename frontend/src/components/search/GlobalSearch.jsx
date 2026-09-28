import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../lib/api.js";
import { interpret, matchesEvent, matchesWell } from "../../lib/query.js";
import { useDebouncedValue } from "../../hooks/index.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { LoadingState, NoResultsState } from "../common/States.jsx";
import {
  NOT_AVAILABLE,
  int,
  isNum,
  label as fmtLabel,
  num,
  similarity,
  splitHighlight
} from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";
import {
  IconActivity,
  IconClose,
  IconFile,
  IconHistory,
  IconNetwork,
  IconSearch
} from "../common/Icons.jsx";

const MAX_PER_GROUP = 6;

function Highlighted({ text, terms }) {
  const parts = useMemo(() => splitHighlight(text, terms), [text, terms]);
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
      )}
    </>
  );
}

function Group({ title, count, icon, children }) {
  if (!count) return null;

  return (
    <div className="result-group" role="group" aria-label={title}>
      <div className="result-group__head">
        {icon}
        {title}
        <span className="result-group__count">{count}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Global intelligence search.
 *
 * Structured hits come from the wells/event/document tables that
 * are already loaded; semantic hits come from the real FAISS
 * index via /api/rag/search. The parsed intent is echoed back
 * so the operator can see how the query was understood.
 */
export function GlobalSearch({
  open,
  onClose,
  wells = [],
  events = [],
  documents,
  currentDepth
}) {
  const [raw, setRaw] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rag, setRag] = useState({ status: "idle", results: [] });
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const controllerRef = useRef(null);

  const debounced = useDebouncedValue(raw, 320);
  const parsed = useMemo(() => interpret(raw), [raw]);
  const terms = useMemo(
    () => parsed.freeTerms.concat(parsed.eventTerms, parsed.signalTerms),
    [parsed]
  );

  useFocusTrap(open, { onClose, autoFocus: false });

  useEffect(() => {
    if (!open) return;
    setRaw("");
    setActiveIndex(0);
    setRag({ status: "idle", results: [] });
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (debounced.trim().length < 2) {
      setRag({ status: "idle", results: [] });
      return undefined;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setRag({ status: "loading", results: [] });

    api
      .ragSearch(debounced.trim(), 6, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRag({ status: "ready", results: data?.results ?? [] });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setRag({ status: "error", results: [] });
      });

    return () => controller.abort();
  }, [debounced, open]);

  const results = useMemo(() => {
    if (!open || parsed.isEmpty) {
      return { wells: [], events: [], documents: [], evidence: [], flat: [] };
    }

    const wellHits = wells
      .filter((well) => matchesWell(well, parsed))
      .slice(0, MAX_PER_GROUP);

    const eventHits = events
      .filter((event) => matchesEvent(event, parsed))
      .slice(0, MAX_PER_GROUP);

    const lower = parsed.raw.toLowerCase();
    const documentHits = (documents?.sources ?? [])
      .filter((source) => {
        const haystack = [
          source.source,
          source.well_id,
          source.formation,
          ...(source.events ?? [])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (parsed.wellId) return source.well_id === parsed.wellId;
        if (parsed.formation && source.formation === parsed.formation) return true;
        if (parsed.eventTerms.length) {
          return parsed.eventTerms.some((term) => haystack.includes(term));
        }
        return terms.some((term) => haystack.includes(term.toLowerCase())) || lower.length > 1;
      })
      .slice(0, MAX_PER_GROUP);

    const evidenceHits = (rag.results ?? []).slice(0, MAX_PER_GROUP);

    const flat = [
      ...wellHits.map((item) => ({ type: "well", item })),
      ...eventHits.map((item) => ({ type: "event", item })),
      ...documentHits.map((item) => ({ type: "document", item })),
      ...evidenceHits.map((item) => ({ type: "evidence", item }))
    ];

    return {
      wells: wellHits,
      events: eventHits,
      documents: documentHits,
      evidence: evidenceHits,
      flat
    };
  }, [open, parsed, wells, events, documents, rag.results, terms]);

  useEffect(() => {
    setActiveIndex(0);
  }, [raw]);

  const activate = useCallback(
    (entry) => {
      if (!entry) return;
      if (entry.type === "well") {
        onClose?.();
        window.dispatchEvent(
          new CustomEvent("nwis:open-well", { detail: { wellId: entry.item.well_id } })
        );
      } else if (entry.type === "event") {
        onClose?.();
        window.dispatchEvent(
          new CustomEvent("nwis:open-well", { detail: { wellId: entry.item.well_id } })
        );
      } else if (entry.type === "document") {
        onClose?.();
        window.dispatchEvent(
          new CustomEvent("nwis:open-document", { detail: { source: entry.item.source } })
        );
      } else {
        onClose?.();
        window.dispatchEvent(
          new CustomEvent("nwis:open-document", {
            detail: { source: entry.item?.metadata?.source }
          })
        );
      }
    },
    [onClose]
  );

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(results.flat[activeIndex]);
    }
  };

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  /* Flat indices are precomputed so keyboard navigation and the
     visual highlight always agree. */
  const index = useMemo(() => {
    let cursor = 0;
    const next = () => cursor++;
    return {
      wells: results.wells.map((item) => ({ item, index: next() })),
      events: results.events.map((item) => ({ item, index: next() })),
      documents: results.documents.map((item) => ({ item, index: next() })),
      evidence: results.evidence.map((item) => ({ item, index: next() }))
    };
  }, [results]);

  const total = results.flat.length;

  if (!open) return null;

  return (
    <>
      <div className="backdrop backdrop--modal" onClick={onClose} role="presentation" />
      <div className="search">
        <div
          className="search__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Global intelligence search"
        >
          <div className="search__field">
            <IconSearch size={16} className="search__glyph" />
            <input
              ref={inputRef}
              className="search__input"
              type="search"
              value={raw}
              placeholder="Search wells, events, formations, documents…"
              onChange={(event) => setRaw(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Search query"
              aria-controls="search-results"
            />
            {raw ? (
              <button
                type="button"
                className="closebtn"
                onClick={() => setRaw("")}
                aria-label="Clear query"
              >
                <IconClose size={12} />
              </button>
            ) : (
              <span className="search__kbd">ESC</span>
            )}
          </div>

          {parsed.interpretations.length > 0 ? (
            <div className="search__interpret">
              <span className="search__interpret-label">Read as</span>
              {parsed.interpretations.map((item) => (
                <span className="badge badge--plain" key={`${item.kind}-${item.text}`}>
                  {item.text}
                </span>
              ))}
              {parsed.wantsCurrentDepth && isNum(currentDepth) ? (
                <span className="badge badge--plain" data-sev="info">
                  live bit {num(currentDepth, 0)} m
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="search__results" id="search-results" ref={listRef}>
            {parsed.isEmpty ? (
              <div className="state state--info">
                <span className="state__icon" aria-hidden="true">
                  <IconSearch size={16} />
                </span>
                <p className="state__title">Search the drilling record</p>
                <p className="state__text">
                  Plain language works. Try “stuck pipe near 2800 m”,
                  “Formation-Y mud losses”, “WELL-017”, or
                  “historical torque problems”.
                </p>
              </div>
            ) : total === 0 && rag.status !== "loading" ? (
              <NoResultsState query={parsed.raw} onClear={() => setRaw("")} />
            ) : (
              <>
                <Group
                  title="Wells"
                  count={results.wells.length}
                  icon={<IconNetwork size={12} />}
                >
                  {index.wells.map(({ item: well, index: rowIndex }) => {
                    return (
                      <button
                        type="button"
                        className="result"
                        key={well.well_id}
                        data-active={rowIndex === activeIndex}
                        onMouseEnter={() => setActiveIndex(rowIndex)}
                        onClick={() => activate({ type: "well", item: well })}
                      >
                        <IconNetwork size={13} className="result__glyph" />
                        <span className="result__body">
                          <span className="result__title">
                            <Highlighted text={fmtLabel(well.well_id)} terms={terms} />
                            <code>{fmtLabel(well.formation)}</code>
                          </span>
                          <span className="result__snippet">
                            {fmtLabel(well.trajectory)} · {fmtLabel(well.hole_section)} ·{" "}
                            {isNum(well.total_depth)
                              ? `${num(well.total_depth, 0)} m TD`
                              : NOT_AVAILABLE}
                          </span>
                        </span>
                        <span className="result__aside">WELL</span>
                      </button>
                    );
                  })}
                </Group>

                <Group title="Events" count={results.events.length} icon={<IconHistory size={12} />}>
                  {index.events.map(({ item: event, index: rowIndex }) => {
                    return (
                      <button
                        type="button"
                        className="result"
                        key={event.event_id ?? `${event.well_id}-${event.depth}`}
                        data-active={rowIndex === activeIndex}
                        onMouseEnter={() => setActiveIndex(rowIndex)}
                        onClick={() => activate({ type: "event", item: event })}
                      >
                        <IconHistory size={13} className="result__glyph" />
                        <span className="result__body">
                          <span className="result__title">
                            <Highlighted text={fmtLabel(event.event)} terms={terms} />
                            <code>{fmtLabel(event.well_id)}</code>
                            <span
                              className="badge"
                              data-sev={severityFromHistorical(event.severity)}
                              style={{ height: 15 }}
                            >
                              {fmtLabel(event.severity)}
                            </span>
                          </span>
                          <span className="result__snippet">
                            {fmtLabel(event.formation)} · {num(event.depth, 0)} m ·{" "}
                            {fmtLabel(event.mitigation)}
                          </span>
                        </span>
                        <span className="result__aside">
                          <b>{num(event.depth, 0)} m</b>
                        </span>
                      </button>
                    );
                  })}
                </Group>

                <Group title="Documents" count={results.documents.length} icon={<IconFile size={12} />}>
                  {index.documents.map(({ item: doc, index: rowIndex }) => {
                    return (
                      <button
                        type="button"
                        className="result"
                        key={doc.source}
                        data-active={rowIndex === activeIndex}
                        onMouseEnter={() => setActiveIndex(rowIndex)}
                        onClick={() => activate({ type: "document", item: doc })}
                      >
                        <IconFile size={13} className="result__glyph" />
                        <span className="result__body">
                          <span className="result__title">
                            <Highlighted text={fmtLabel(doc.source)} terms={terms} />
                            <code>{fmtLabel(doc.well_id)}</code>
                          </span>
                          <span className="result__snippet">
                            {int(doc.chunks)} chunk{doc.chunks === 1 ? "" : "s"}
                            {isNum(doc.depth) ? ` · ${num(doc.depth, 0)} m` : ""}
                            {(doc.events ?? []).length > 0 ? ` · ${doc.events.join(", ")}` : ""}
                          </span>
                        </span>
                        <span className="result__aside">{doc.format?.toUpperCase() ?? ""}</span>
                      </button>
                    );
                  })}
                </Group>

                <Group
                  title="Evidence"
                  count={results.evidence.length}
                  icon={<IconActivity size={12} />}
                >
                  {index.evidence.map(({ item: doc, index: rowIndex }) => {
                    return (
                      <button
                        type="button"
                        className="result"
                        key={doc?.id ?? `evidence-${rowIndex}`}
                        data-active={rowIndex === activeIndex}
                        onMouseEnter={() => setActiveIndex(rowIndex)}
                        onClick={() => activate({ type: "evidence", item: doc })}
                      >
                        <IconActivity size={13} className="result__glyph" />
                        <span className="result__body">
                          <span className="result__title">
                            <Highlighted
                              text={fmtLabel(doc?.metadata?.source)}
                              terms={terms}
                            />
                            <code>{fmtLabel(doc?.metadata?.event)}</code>
                          </span>
                          <span className="result__snippet">{doc?.text}</span>
                        </span>
                        <span className="result__aside">
                          <b>{similarity(doc?.relevance, 1)}</b> match
                        </span>
                      </button>
                    );
                  })}
                </Group>
              </>
            )}

            {rag.status === "loading" ? (
              <div style={{ padding: "var(--s-6)" }}>
                <LoadingState label="Searching historical documents…" />
              </div>
            ) : null}

            {rag.status === "error" ? (
              <div
                className="state state--tight state--error"
                role="alert"
                style={{ padding: "var(--s-6)" }}
              >
                <p className="state__title">Semantic search unavailable</p>
                <p className="state__text">
                  The structured results above are unaffected. The vector
                  index could not be queried.
                </p>
              </div>
            ) : null}
          </div>

          <footer className="search__foot">
            <span className="search__hint">
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate
            </span>
            <span className="search__hint">
              <kbd>↵</kbd> open
            </span>
            <span className="search__hint">
              <kbd>esc</kbd> close
            </span>
            <span className="search__spacer" />
            {total > 0 ? (
              <span>
                {int(total)} result{total === 1 ? "" : "s"}
                {results.evidence.length > 0 ? " · semantic" : ""}
              </span>
            ) : null}
          </footer>
        </div>
      </div>
    </>
  );
}

export default GlobalSearch;
