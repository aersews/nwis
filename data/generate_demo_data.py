from pathlib import Path
import csv, math, random
from datetime import datetime, timedelta

random.seed(26121)
OUT = Path(__file__).resolve().parent

formations = ["Formation-X", "Formation-Y", "Formation-Z"]
trajectories = ["Vertical", "Directional", "Horizontal"]
hole_sections = ['12.25"', '8.5"', '6"']

wells = []
base_lat, base_lon = 27.60, 95.35
for i in range(1, 31):
    wells.append({
        "well_id": f"WELL-{i:03d}",
        "latitude": base_lat + random.uniform(-0.045, 0.045),
        "longitude": base_lon + random.uniform(-0.045, 0.045),
        "formation": random.choice(formations),
        "trajectory": random.choice(trajectories),
        "total_depth": random.uniform(3000, 3900),
        "hole_section": random.choice(hole_sections)
    })

with open(OUT/"wells.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=wells[0].keys()); w.writeheader(); w.writerows(wells)

rows = []
events = []
start = datetime(2026, 1, 1)
for w in wells:
    event_well = random.random() < 0.55
    event_depth = random.uniform(2500, min(w["total_depth"]-100, 3500)) if event_well else None
    event_type = random.choice(["Lost Circulation", "Stuck Pipe", "Kick"]) if event_well else None

    for j in range(120):
        depth = 1800 + j * 14 + random.uniform(-2, 2)
        t = start + timedelta(minutes=j*20)
        rop = max(5, random.gauss(21, 3))
        torque = max(5, random.gauss(17, 2))
        ecd = random.gauss(1.20, 0.025)
        pit = random.gauss(100, 1.5)

        # Event precursor fingerprint near historical event.
        if event_depth and abs(depth-event_depth) < 45:
            rop *= 0.62
            torque *= 1.55
            ecd += 0.08
            pit -= 5

        rows.append({
            "well_id": w["well_id"], "timestamp": t.isoformat(),
            "depth": round(depth,2), "rop": round(rop,2),
            "wob": round(random.gauss(12,1.5),2), "rpm": round(random.gauss(110,8),2),
            "torque": round(torque,2), "spp": round(random.gauss(1800,100),2),
            "ecd": round(ecd,3), "flow_rate": round(random.gauss(450,20),2),
            "pit_volume": round(pit,2)
        })

    if event_well:
        events.append({
            "event_id": f"EV-{len(events)+1:04d}",
            "well_id": w["well_id"], "formation": w["formation"],
            "depth": round(event_depth,2), "event": event_type,
            "severity": random.choice(["Moderate","Severe"]),
            "precursors": "ROP decrease; Torque increase; ECD increase; Pit-volume deviation",
            "mitigation": "LCM treatment and controlled drilling parameters" if event_type=="Lost Circulation" else "Operational response and circulation management",
            "outcome": "Condition stabilized after intervention",
            "source": f"DDR-{w['well_id']}-DEMO"
        })

with open(OUT/"drilling_data.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
with open(OUT/"events.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=events[0].keys()); w.writeheader(); w.writerows(events)

print(f"Generated {len(wells)} wells, {len(rows)} drilling records, {len(events)} events.")
