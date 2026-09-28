/* =========================================================
   NWIS — ICON SET
   Single-weight 16px stroke icons, currentColor. No icon
   font, no emoji — one consistent technical voice.
   ========================================================= */

const S = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

const make = (paths, overrides) =>
  function Icon({ size = 16, ...rest }) {
    return (
      <svg
        {...S}
        {...overrides}
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  };

export const IconAlert = make(
  <>
    <path d="M8 2.6 14.4 13.4H1.6L8 2.6Z" />
    <path d="M8 6.8v3.1" />
    <path d="M8 11.6h.01" />
  </>
);

export const IconShieldAlert = make(
  <>
    <path d="M8 1.8 13.4 3.7v4.1c0 3.2-2.2 5.4-5.4 6.4-3.2-1-5.4-3.2-5.4-6.4V3.7L8 1.8Z" />
    <path d="M8 5.6v3" />
    <path d="M8 10.6h.01" />
  </>
);

export const IconCheck = make(<path d="M3 8.4 6.4 11.8 13 5.2" />);

export const IconCheckCircle = make(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M5.4 8.2 7.2 10l3.4-3.6" />
  </>
);

export const IconInfo = make(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.4v3.4" />
    <path d="M8 5.3h.01" />
  </>
);

export const IconSearch = make(
  <>
    <circle cx="7.2" cy="7.2" r="4.4" />
    <path d="M10.5 10.5 13.6 13.6" />
  </>
);

export const IconClose = make(<path d="M4 4l8 8M12 4l-8 8" />);

export const IconChevronRight = make(<path d="M6.2 3.6 10.6 8l-4.4 4.4" />);
export const IconChevronLeft = make(<path d="M9.8 3.6 5.4 8l4.4 4.4" />);
export const IconChevronDown = make(<path d="M3.6 6.2 8 10.6l4.4-4.4" />);
export const IconArrowRight = make(<path d="M3 8h10M9.2 4.2 13 8l-3.8 3.8" />);
export const IconArrowUp = make(<path d="M8 12.6V3.4M4.2 7.2 8 3.4l3.8 3.8" />);
export const IconArrowDown = make(<path d="M8 3.4v9.2M4.2 8.8 8 12.6l3.8-3.8" />);
export const IconMinus = make(<path d="M3.4 8h9.2" />);

export const IconPlay = make(<path d="M5 3.2 12.4 8 5 12.8V3.2Z" />);
export const IconPause = make(<path d="M6 3.4v9.2M10 3.4v9.2" />);
export const IconRestart = make(
  <>
    <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
    <path d="M13.4 2.4v3.2h-3.2" />
  </>
);
export const IconStep = make(<path d="M4 3.4 9 8l-5 4.6V3.4ZM12 3.2v9.6" />);

export const IconActivity = make(<path d="M1.8 8h2.8l2-5 3 10 2-5h2.6" />);

export const IconRadio = make(
  <>
    <circle cx="8" cy="8" r="1.8" />
    <path d="M4.6 4.6a4.8 4.8 0 0 0 0 6.8M11.4 4.6a4.8 4.8 0 0 1 0 6.8" />
    <path d="M2.2 2.2a8.2 8.2 0 0 0 0 11.6M13.8 2.2a8.2 8.2 0 0 1 0 11.6" />
  </>
);

export const IconMap = make(
  <>
    <path d="M1.9 4.2 5.4 2.6v9.2L1.9 13.4V4.2Z" />
    <path d="M5.4 2.6 10.6 4.2v9.2L5.4 11.8V2.6Z" />
    <path d="M10.6 4.2 14.1 2.6v9.2l-3.5 1.6V4.2Z" />
  </>
);

export const IconTarget = make(
  <>
    <circle cx="8" cy="8" r="5.4" />
    <circle cx="8" cy="8" r="1.6" />
    <path d="M8 0.8v2.4M8 12.8v2.4M0.8 8h2.4M12.8 8h2.4" />
  </>
);

export const IconRuler = make(
  <>
    <path d="M1.6 9.4 9.4 1.6l5 5-7.8 7.8-5-5Z" />
    <path d="M5.4 5.6 6.8 7M7.6 3.4 9 4.8M9.8 7.2 11.2 8.6" />
  </>
);

export const IconLayers = make(
  <>
    <path d="M8 1.8 14.4 5 8 8.2 1.6 5 8 1.8Z" />
    <path d="M1.6 8 8 11.2 14.4 8" />
    <path d="M1.6 11 8 14.2 14.4 11" />
  </>
);

export const IconFile = make(
  <>
    <path d="M9.2 1.8H4.4a1.4 1.4 0 0 0-1.4 1.4v9.6a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4V5.4L9.2 1.8Z" />
    <path d="M9.2 1.8V5.4h3.8" />
    <path d="M5.6 8.6h4.8M5.6 11h3.2" />
  </>
);

export const IconDatabase = make(
  <>
    <ellipse cx="8" cy="3.8" rx="5.4" ry="2" />
    <path d="M2.6 3.8v8.4c0 1.1 2.4 2 5.4 2s5.4-.9 5.4-2V3.8" />
    <path d="M2.6 8c0 1.1 2.4 2 5.4 2s5.4-.9 5.4-2" />
  </>
);

export const IconClock = make(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.4V8l2.4 1.6" />
  </>
);

export const IconLink = make(
  <>
    <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l1.8-1.8a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
    <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3L3.7 8.1a2.6 2.6 0 0 0 3.7 3.7l1-1" />
  </>
);

export const IconNetwork = make(
  <>
    <circle cx="8" cy="3.4" r="1.8" />
    <circle cx="3.2" cy="12" r="1.8" />
    <circle cx="12.8" cy="12" r="1.8" />
    <path d="M6.9 4.9 4.3 10.4M9.1 4.9l2.6 5.5M5 12h6" />
  </>
);

export const IconGitCommit = make(
  <>
    <circle cx="8" cy="8" r="2.4" />
    <path d="M1.8 8h3.8M10.4 8h3.8" />
  </>
);

export const IconCompare = make(
  <>
    <path d="M8 2v12" />
    <path d="M4.6 5.2 1.8 8l2.8 2.8" />
    <path d="M11.4 5.2 14.2 8l-2.8 2.8" />
  </>
);

export const IconFilter = make(<path d="M1.8 3.2h12.4l-4.8 5.6v4.4l-2.8 1.4V8.8L1.8 3.2Z" />);

export const IconSort = make(
  <>
    <path d="M3.4 4.4V12M1.4 6.4l2-2 2 2" />
    <path d="M9.4 11.6V4M7.4 9.6l2 2 2-2" />
  </>
);

export const IconEye = make(
  <>
    <path d="M1 8s2.6-4.4 7-4.4S15 8 15 8s-2.6 4.4-7 4.4S1 8 1 8Z" />
    <circle cx="8" cy="8" r="1.8" />
  </>
);

export const IconExternal = make(
  <>
    <path d="M9.2 2.4h4.4v4.4" />
    <path d="M13.6 2.4 7.4 8.6" />
    <path d="M11.4 9.6v3a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 12.6V6a1.4 1.4 0 0 1 1.4-1.4h3" />
  </>
);

export const IconBolt = make(<path d="M8.8 1.4 3.4 9.2h3.8l-.8 5.4 5.4-7.8H7.8l1-5.4Z" />);

export const IconBook = make(
  <>
    <path d="M2.4 2.6h4.2A1.8 1.8 0 0 1 8 3.2v9.4a1.4 1.4 0 0 0-1.4-1.2H2.4V2.6Z" />
    <path d="M13.6 2.6H9.4A1.8 1.8 0 0 0 8 3.2v9.4a1.4 1.4 0 0 1 1.4-1.2h4.2V2.6Z" />
  </>
);

export const IconGrid = make(
  <>
    <path d="M2.4 2.4h4.4v4.4H2.4V2.4ZM9.2 2.4h4.4v4.4H9.2V2.4ZM2.4 9.2h4.4v4.4H2.4V9.2ZM9.2 9.2h4.4v4.4H9.2V9.2Z" />
  </>
);

export const IconTrend = make(
  <>
    <path d="M1.8 12.4 5.4 8.2l2.6 2.4 5.4-6" />
    <path d="M10.6 4.6h2.8v2.8" />
  </>
);

export const IconRefresh = make(
  <>
    <path d="M13.4 8a5.4 5.4 0 1 1-1.7-3.9" />
    <path d="M13.6 2.2v3.4h-3.4" />
  </>
);

export const IconRoute = make(
  <>
    <circle cx="4" cy="4" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <path d="M5.8 4h3.4a2.8 2.8 0 0 1 0 5.6H6.8a2.8 2.8 0 0 0 0 2.4H10.2" />
  </>
);

export const IconScale = make(
  <>
    <path d="M8 2.2v11.6" />
    <path d="M3.4 4.6h9.2" />
    <path d="M3.4 4.6 1.4 9.2h4L3.4 4.6Z" />
    <path d="M12.6 4.6 10.6 9.2h4l-2-4.6Z" />
  </>
);

export const IconMaximize = make(<path d="M6 2.4H2.4V6M10 2.4h3.6V6M10 13.6h3.6V10M6 13.6H2.4V10" />);

export const IconSatellite = make(
  <>
    <path d="M6.6 9.4 3.4 6.2a4.6 4.6 0 0 1 6-6l3.2 3.2" />
    <path d="M9.4 6.6 12.6 9.8a4.6 4.6 0 0 1-6 6L3.4 12.6" />
    <path d="M6.2 6.2 9.8 9.8" />
  </>
);

export const IconDepth = make(
  <>
    <path d="M8 1.8v9" />
    <path d="M5.4 10.8 8 14.2l2.6-3.4" />
    <path d="M2.6 5.4h2.2M11.2 5.4h2.2" />
  </>
);

export const IconHistory = make(
  <>
    <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
    <path d="M2.4 2.2v3.4h3.4" />
    <path d="M8 5.2V8l2 1.2" />
  </>
);

export const IconSpark = make(
  <>
    <path d="M8 1.8 9.5 6l4.2 1.5L9.5 9 8 13.2 6.5 9 2.3 7.5 6.5 6 8 1.8Z" />
  </>
);

export const IconRadar = make(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <circle cx="8" cy="8" r="3" />
    <path d="M8 8 12.4 4.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6" />
  </>
);
