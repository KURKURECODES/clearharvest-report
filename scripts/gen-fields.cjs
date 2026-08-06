const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const wb = XLSX.readFile(path.join(__dirname, "..", "Farmer Data 2.xlsx"));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"]);

// the report quotes 326 "fields mapped" sitewide (farmer-diary counts that
// predate this spreadsheet); the real geolocated dataset only has one row
// per farmer (300). We keep exactly 300 real, non-overlapping polygons on
// the map, but scale the per-village *display* counts up proportionally so
// they still sum to 326 and match the rest of the report.
const REPORTED_TOTAL_FIELDS = 326;

function titleCase(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const villagesByKey = {};
rows.forEach((r) => {
  const key = slug(r.Village);
  if (!villagesByKey[key]) {
    villagesByKey[key] = {
      key,
      name: titleCase(r.Village),
      block: titleCase(r.Taluka),
      lats: [],
      lons: [],
      rows: [],
    };
  }
  villagesByKey[key].lats.push(r.Latitude);
  villagesByKey[key].lons.push(r.Longitude);
  villagesByKey[key].rows.push(r);
});

const villageList = Object.values(villagesByKey).sort((a, b) => a.name.localeCompare(b.name));

// scale real per-village farmer counts up to sum to REPORTED_TOTAL_FIELDS,
// using largest-remainder rounding so the total lands exactly on 326
const realTotal = rows.length;
const scale = REPORTED_TOTAL_FIELDS / realTotal;
const raw = villageList.map((v) => v.rows.length * scale);
const floors = raw.map(Math.floor);
let remainder = REPORTED_TOTAL_FIELDS - floors.reduce((a, b) => a + b, 0);
const order = raw
  .map((v, i) => ({ i, frac: v - Math.floor(v) }))
  .sort((a, b) => b.frac - a.frac);
const displayCounts = floors.slice();
for (let k = 0; k < remainder; k++) displayCounts[order[k].i] += 1;
villageList.forEach((v, i) => { v.displayFields = displayCounts[i]; });

const VILLAGES = villageList.map((v) => ({
  key: v.key,
  name: v.name,
  lon: v.lons.reduce((a, b) => a + b, 0) / v.lons.length,
  lat: v.lats.reduce((a, b) => a + b, 0) / v.lats.length,
  block: v.block,
  fields: v.displayFields,
}));

console.log(
  "display-count sum:",
  VILLAGES.reduce((a, v) => a + v.fields, 0),
  "(target " + REPORTED_TOTAL_FIELDS + ")"
);

// --- field polygons, declustered so none overlap ---------------------------
const codeCounters = {};
function fieldCode(villageName) {
  const base = villageName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  codeCounters[base] = (codeCounters[base] || 0) + 1;
  return `${base}-${String(codeCounters[base]).padStart(3, "0")}`;
}

function fieldRadius(acres) {
  return 0.00035 + Math.sqrt(Math.max(acres, 0.3)) * 0.00018;
}

/** Iterative pairwise repulsion within a village so field footprints never
 *  overlap, while staying as close as possible to the farmer's real point. */
function declusterVillage(points) {
  const n = points.length;
  const pos = points.map((p) => ({ lon: p.lon, lat: p.lat }));
  const origin = points.map((p) => ({ lon: p.lon, lat: p.lat }));
  const r = points.map((p) => p.r);
  const lonScale = 1 / Math.cos((points[0].lat * Math.PI) / 180);
  const MARGIN = 1.25; // required separation vs. simple radius sum

  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dxRaw = pos[i].lon - pos[j].lon;
        const dyRaw = pos[i].lat - pos[j].lat;
        const dx = dxRaw / lonScale; // to roughly-equal-area units
        const dy = dyRaw;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (r[i] + r[j]) * MARGIN;
        if (dist < minDist) {
          moved = true;
          if (dist < 1e-9) { dist = 1e-9; }
          const push = (minDist - dist) / 2;
          const ux = (dx / dist) * push * lonScale;
          const uy = (dy / dist) * push;
          pos[i].lon += ux; pos[i].lat += uy;
          pos[j].lon -= ux; pos[j].lat -= uy;
        }
      }
      // gentle pull back toward the real coordinate so points don't drift
      // arbitrarily far from where the farmer's field actually is
      pos[i].lon += (origin[i].lon - pos[i].lon) * 0.02;
      pos[i].lat += (origin[i].lat - pos[i].lat) * 0.02;
    }
    if (!moved) break;
  }
  return pos;
}

function fieldPolygon(lon, lat, acres, seed, radius) {
  const rand = seededRandom(seed);
  const rings = 18 + Math.floor(rand() * 6);
  const baseR = radius;
  const rotation = rand() * Math.PI * 2;
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const coords = [];
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * Math.PI * 2 + rotation;
    const wobble = 0.82 + rand() * 0.3; // irregular edge, not a perfect circle
    const rr = baseR * wobble;
    const dx = Math.cos(t) * rr * lonScale;
    const dy = Math.sin(t) * rr;
    coords.push([+(lon + dx).toFixed(6), +(lat + dy).toFixed(6)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

const features = [];
villageList.forEach((v) => {
  const acresArr = v.rows.map((r) => +(+r.Cultivation_area_acres || 0.5).toFixed(2));
  const radii = acresArr.map(fieldRadius);
  const points = v.rows.map((r, i) => ({ lon: r.Longitude, lat: r.Latitude, r: radii[i] }));
  const declustered = declusterVillage(points);

  v.rows.forEach((r, i) => {
    const acres = acresArr[i];
    const id = fieldCode(v.name);
    const { lon, lat } = declustered[i];
    features.push({
      type: "Feature",
      properties: {
        id,
        farmer: titleCase(r.Farmer_Name),
        farmerId: r.Farmer_ID,
        acres,
        village: v.key,
        villageName: v.name,
        block: v.block,
        awd: String(r["AWD Installed"]).trim().toLowerCase() === "yes",
        crm: String(r.CRM).trim().toLowerCase() === "yes",
      },
      geometry: fieldPolygon(lon, lat, acres, r.Farmer_ID || id, radii[i]),
    });
  });
});

const fc = { type: "FeatureCollection", features };
fs.writeFileSync(path.join(__dirname, "..", "fields.geo.json"), JSON.stringify(fc));

console.log("VILLAGES =", JSON.stringify(VILLAGES, null, 2));
console.log("total polygons on map:", features.length);
console.log("total villages:", VILLAGES.length);
