"""
Generate realistic paddy-field parcels.

Real cadastral fields are not boxes. They tessellate - neighbours share bunds,
parcels are irregular convex-ish polygons of uneven size, and the whole village
land block is bounded by an irregular edge with canals and access tracks cutting
through it. A Lloyd-relaxed Voronoi diagram reproduces that structure closely:
shared edges, no gaps, organic variation in size and shape.

Pipeline per village:
  1. irregular village land blob, area scaled to the village's acre target
  2. scatter N seeds, Lloyd-relax 3x so parcel sizes even out
  3. Voronoi, clipped to the blob
  4. subtract a canal + access track (real villages are cut by these)
  5. erode each cell ~1.6 m to open a visible bund between neighbours
  6. densify + jitter the edges so bunds read as walked, not drafted
  7. derive acreage FROM the drawn polygon, so the number matches the shape
"""
import json, math, random, os
import numpy as np
from scipy.spatial import Voronoi
from shapely.geometry import Polygon, Point, LineString, MultiPolygon, mapping
from shapely.ops import unary_union
from shapely.affinity import translate

VILLAGES = [
    ("ghanpur",    "Ghanpur",    77.9271, 18.5734, 82, "Chandur"),
    ("sangam",     "Sangam",     77.9121, 18.6038, 68, "Chandur"),
    ("kunipoor",   "Kunipoor",   77.9406, 18.5111, 75, "Varni"),
    ("srinagar",   "Srinagar",   77.9253, 18.5371, 55, "Varni"),
    ("bhavanipet", "Bhavanipet", 77.9251, 18.5801, 46, "Chandur"),
]
SUR = ["Kolluri","Gundeti","Bandari","Mekala","Pochampally","Nalla","Yerram","Kandula",
       "Bhoomaiah","Sirikonda","Racha","Dharmapuri","Vemula","Jangam","Peddi","Thumma","Gadela"]
GIV = ["Gangaram","Venu","Ashok","Narsimha","Ramulu","Srinivas","Lakshmi","Anjaiah","Mallesh",
       "Sailu","Rajitha","Kumar","Padma","Bhaskar","Swaroopa","Ravi","Yadamma","Komuraiah"]

TOTAL_ACRES = 1718.0
BLOB_TUNE = 0.879   # calibrated so the drawn parcels total ~1,718 acres
TOTAL_FIELDS = sum(v[4] for v in VILLAGES)
ACRE_M2 = 4046.86
M_PER_DEG_LAT = 110574.0


def village_blob(area_m2, rnd, lobes=7):
    """Irregular land block - sum of low-frequency sines on the radius."""
    r0 = math.sqrt(area_m2 / math.pi)
    phases = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.04, 0.13), rnd.randint(2, 5))
              for _ in range(lobes)]
    pts = []
    for i in range(220):
        t = 2 * math.pi * i / 220
        r = r0 * (1 + sum(a * math.sin(k * t + p) for p, a, k in phases))
        pts.append((r * math.cos(t), r * math.sin(t)))
    return Polygon(pts).buffer(0)


def lloyd(seeds, boundary, iters=3):
    """Relax seeds toward their cell centroids so parcel sizes even out."""
    for _ in range(iters):
        cells = voronoi_cells(seeds, boundary)
        new = []
        for s, c in zip(seeds, cells):
            new.append((c.centroid.x, c.centroid.y) if c and not c.is_empty else s)
        seeds = new
    return seeds


def voronoi_cells(seeds, boundary):
    """Voronoi clipped to boundary. Mirrored ghost points close the hull."""
    pts = np.array(seeds)
    c = pts.mean(axis=0)
    span = max(boundary.bounds[2] - boundary.bounds[0], boundary.bounds[3] - boundary.bounds[1])
    ghosts = np.array([[c[0] + span * 3 * math.cos(a), c[1] + span * 3 * math.sin(a)]
                       for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)])
    vor = Voronoi(np.vstack([pts, ghosts]))
    out = []
    for i in range(len(pts)):
        region = vor.regions[vor.point_region[i]]
        if not region or -1 in region:
            out.append(None); continue
        poly = Polygon([vor.vertices[j] for j in region])
        if not poly.is_valid: poly = poly.buffer(0)
        clipped = poly.intersection(boundary)
        out.append(clipped if not clipped.is_empty else None)
    return out


def densify_jitter(poly, rnd, step=16.0, amp=1.5):
    """Walk the ring inserting points, nudging each - a bund is never straight."""
    ring = list(poly.exterior.coords)[:-1]
    out = []
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        seg = math.hypot(x1 - x0, y1 - y0)
        k = max(1, int(seg // step))
        for j in range(k):
            t = j / k
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            # corners stay tight; mid-edge wanders
            w = amp * (1 if 0 < j else 0.35)
            out.append((px + rnd.uniform(-w, w), py + rnd.uniform(-w, w)))
    p = Polygon(out)
    return p.buffer(0) if not p.is_valid else p


def biggest(geom):
    if geom is None or geom.is_empty: return None
    if geom.geom_type == "Polygon": return geom
    if geom.geom_type == "MultiPolygon":
        return max(geom.geoms, key=lambda g: g.area)
    return None


# ---------------------------------------------------------------------------
# Village land partition.
# The coordinates in VILLAGES come from the GPS stamps on the annexure
# photographs - they are capture points, and some sit under a kilometre apart.
# Land blocks sized for each village's acreage would therefore overlap. Real
# villages don't overlap: adjacent revenue boundaries partition the land and
# meet along a shared line. A Voronoi over the village centres reproduces that,
# and it lets the real coordinates stay untouched.
# ---------------------------------------------------------------------------
def village_partition():
    lat0 = sum(v[3] for v in VILLAGES) / len(VILLAGES)
    mlon = 111320.0 * math.cos(math.radians(lat0))
    cent = [((v[2] - VILLAGES[0][2]) * mlon, (v[3] - VILLAGES[0][3]) * M_PER_DEG_LAT)
            for v in VILLAGES]
    span = 14000.0
    box = Polygon([(-span, -span), (span, -span), (span, span), (-span, span)])
    cells = voronoi_cells(cent, box)
    return {VILLAGES[i][0]: (cells[i], cent[i]) for i in range(len(VILLAGES))}

PARTITION = village_partition()

features = []
for vi, (key, name, lon, lat, n, block) in enumerate(VILLAGES):
    rnd = random.Random(vi * 104729 + 7)
    nprnd = np.random.default_rng(vi * 104729 + 7)

    target_acres = TOTAL_ACRES * n / TOTAL_FIELDS
    cell, offset = PARTITION[key]
    # blob is built in the partition's shared frame, then clipped to this
    # village's cell so neighbouring land blocks meet instead of overlapping
    blob_free = village_blob(target_acres * ACRE_M2 * 1.35 * BLOB_TUNE, rnd)
    blob = translate(blob_free, xoff=offset[0], yoff=offset[1]).intersection(cell)
    blob = biggest(blob)
    # if the cell clipped away too much, grow the blob until the land fits
    grow = 1.0
    while blob is not None and blob.area < target_acres * ACRE_M2 * 1.10 * BLOB_TUNE and grow < 4.0:
        grow *= 1.18
        blob = biggest(translate(village_blob(target_acres * ACRE_M2 * 1.35 * BLOB_TUNE * grow, rnd),
                                 xoff=offset[0], yoff=offset[1]).intersection(cell))
    blob = translate(blob, xoff=-offset[0], yoff=-offset[1])  # back to local frame

    # scatter seeds by rejection sampling inside the blob
    minx, miny, maxx, maxy = blob.bounds
    seeds = []
    while len(seeds) < n:
        p = (nprnd.uniform(minx, maxx), nprnd.uniform(miny, maxy))
        if blob.contains(Point(p)): seeds.append(p)
    seeds = lloyd(seeds, blob, iters=3)

    # an irrigation canal and an access track cut the land block
    ang = rnd.uniform(0, math.pi)
    span = max(maxx - minx, maxy - miny)
    canal = LineString([(-span * math.cos(ang), -span * math.sin(ang)),
                        (span * math.cos(ang), span * math.sin(ang))]).buffer(5.5)
    ang2 = ang + math.pi / 2 + rnd.uniform(-0.35, 0.35)
    off = rnd.uniform(-span * 0.18, span * 0.18)
    track = LineString([(-span * math.cos(ang2) + off, -span * math.sin(ang2) + off),
                        (span * math.cos(ang2) + off, span * math.sin(ang2) + off)]).buffer(3.5)
    cutters = unary_union([canal, track])

    cells = voronoi_cells(seeds, blob)
    made = 0
    for i, cell in enumerate(cells):
        cell = biggest(cell)
        if cell is None or cell.area < 900: continue
        cell = biggest(cell.difference(cutters))
        if cell is None or cell.area < 900: continue
        # erode to open the bund between neighbouring parcels
        cell = biggest(cell.buffer(-1.6))
        if cell is None or cell.area < 800: continue
        cell = densify_jitter(cell, rnd)
        cell = biggest(cell)
        if cell is None or cell.area < 800: continue
        if len(cell.exterior.coords) > 90:
            cell = cell.simplify(0.8, preserve_topology=True)

        made += 1
        acres = round(cell.area / ACRE_M2, 2)          # derived from the shape
        mlon = 111320.0 * math.cos(math.radians(lat))
        coords = [[round(lon + x / mlon, 5), round(lat + y / M_PER_DEG_LAT, 5)]
                  for x, y in cell.exterior.coords]
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"{key[:3].upper()}-{made:03d}",
                "farmer": f"{rnd.choice(SUR)} {rnd.choice(GIV)}",
                "acres": acres,
                "village": key, "villageName": name, "block": block,
                "awd": rnd.random() > 0.06,
                "crm": rnd.random() > 0.62,
            },
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        })
    print(f"  {name:11s} seeds {n:3d} -> parcels {made:3d}")

fc = {"type": "FeatureCollection", "features": features}
json.dump(fc, open("fields.geo.json", "w"), separators=(",", ":"))
tot = sum(f["properties"]["acres"] for f in features)
verts = [len(f["geometry"]["coordinates"][0]) for f in features]
print(f"\nfields: {len(features)}  acres: {tot:.1f}  mean: {tot/len(features):.2f}")
print(f"vertices per field: min {min(verts)} median {sorted(verts)[len(verts)//2]} max {max(verts)}")
print(f"size: {os.path.getsize('fields.geo.json')/1024:.1f} KB")
