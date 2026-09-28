CREATE TABLE wells (
    well_id TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    formation TEXT NOT NULL,
    trajectory TEXT NOT NULL,
    total_depth REAL NOT NULL,
    hole_section TEXT NOT NULL
);

CREATE TABLE drilling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    well_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    depth REAL NOT NULL,
    rop REAL NOT NULL,
    wob REAL NOT NULL,
    rpm REAL NOT NULL,
    torque REAL NOT NULL,
    spp REAL NOT NULL,
    ecd REAL NOT NULL,
    flow_rate REAL NOT NULL,
    pit_volume REAL NOT NULL
);

CREATE TABLE events (
    event_id TEXT PRIMARY KEY,
    well_id TEXT NOT NULL,
    formation TEXT NOT NULL,
    depth REAL NOT NULL,
    event TEXT NOT NULL,
    severity TEXT NOT NULL,
    precursors TEXT NOT NULL,
    mitigation TEXT NOT NULL,
    outcome TEXT NOT NULL,
    source TEXT NOT NULL
);
