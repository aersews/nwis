import { memo } from "react";

const RADII = [5, 10, 25, 50];

/** Search radius for the offset neighbourhood. */
export const RadiusControl = memo(function RadiusControl({
  value,
  onChange
}) {
  return (
    <div
      className="radius-control"
      role="group"
      aria-label="Offset search radius"
    >
      <span className="radius-control__label">Radius</span>
      <div className="radius-control__options">
        {RADII.map((km) => (
          <button
            key={km}
            type="button"
            className="radius-control__opt"
            aria-pressed={value === km}
            onClick={() => onChange?.(km)}
            title={`Show offsets within ${km} km`}
          >
            {km}
            <span aria-hidden="true"> km</span>
          </button>
        ))}
      </div>
    </div>
  );
});

export default RadiusControl;
