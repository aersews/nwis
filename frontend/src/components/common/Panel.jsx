import { memo } from "react";

/**
 * The single surface primitive. Every intelligence block in
 * NWIS is a Panel so spacing, borders and header rhythm can
 * never drift apart between sections.
 */
function PanelBase({
  as: Tag = "section",
  id,
  index,
  title,
  subtitle,
  tools,
  severity = "none",
  accent = false,
  plainHead = false,
  bodyClass = "",
  bodyStyle,
  className = "",
  children,
  footer,
  scrollBody = false,
  ...rest
}) {
  const classes = [
    "panel",
    severity !== "none" ? "panel--sev" : "",
    accent ? "panel--accent" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      id={id}
      className={classes}
      data-sev={severity}
      tabIndex={-1}
      {...rest}
    >
      {(title || tools || index) && (
        <header className={`panel__head${plainHead ? " panel__head--plain" : ""}`}>
          {index ? <span className="panel__index">{index}</span> : null}
          {title ? <h3 className="panel__title">{title}</h3> : null}
          {subtitle ? (
            <span className="panel__title-sub">{subtitle}</span>
          ) : null}
          <span className="panel__spacer" />
          {tools ? <div className="panel__tools">{tools}</div> : null}
        </header>
      )}

      <div
        className={[
          "panel__body",
          bodyClass,
          scrollBody ? "panel__body--scroll" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        style={bodyStyle}
      >
        {children}
      </div>

      {footer ? <div className="panel__foot">{footer}</div> : null}
    </Tag>
  );
}

export const Panel = memo(PanelBase);

export default Panel;
