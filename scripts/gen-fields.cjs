const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const wb = XLSX.readFile(path.join(__dirname, "..", "Farmer Data 2.xlsx"));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"]);

function titleCase(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// deterministic pseudo-random from a string seed, so re-running the
// generator produces identical geometry (stable diffs, no map "jitter"
// between builds)
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

// villages, aggregated from the real farmer rows
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
    };
  }
  villagesByKey[key].lats.push(r.Latitude);
  villagesByKey[key].lons.push(r.Longitude);
});

const VILLAGES = Object.values(villagesByKey)
  .map((v) => ({
    key: v.key,
    name: v.name,
    lon: v.lons.reduce((a, b) => a + b, 0) / v.lons.length,
    lat: v.lats.reduce((a, b) => a + b, 0) / v.lats.length,
    block: v.block,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// village-code prefixes for field IDs, e.g. "Ghanpur" -> "GHA"
const codeCounters = {};
function fieldCode(villageName) {
  const base = villageName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  codeCounters[base] = (codeCounters[base] || 0) + 1;
  return `${base}-${String(codeCounters[base]).padStart(3, "0")}`;
}

// small organic-looking polygon around a point, sized by sqrt(acres),
// with a seeded random rotation/jitter so fields don't look identical
function fieldPolygon(lon, lat, acres, seed) {
  const rand = seededRandom(seed);
  const rings = 18 + Math.floor(rand() * 6); // vertex count
  const baseR = 0.00035 + Math.sqrt(Math.max(acres, 0.3)) * 0.00018;
  const rotation = rand() * Math.PI * 2;
  // latitude correction so the shape isn't visually squashed east-west
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const coords = [];
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * Math.PI * 2 + rotation;
    const wobble = 0.78 + rand() * 0.44; // irregular edge, not a perfect circle
    const r = baseR * wobble;
    const dx = Math.cos(t) * r * lonScale;
    const dy = Math.sin(t) * r;
    coords.push([+(lon + dx).toFixed(6), +(lat + dy).toFixed(6)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

const features = rows.map((r) => {
  const villageKey = slug(r.Village);
  const village = villagesByKey[villageKey];
  const acres = +(+r.Cultivation_area_acres || 0.5).toFixed(2);
  const id = fieldCode(village.name);
  return {
    type: "Feature",
    properties: {
      id,
      farmer: titleCase(r.Farmer_Name),
      acres,
      village: villageKey,
      villageName: village.name,
      block: village.block,
      awd: String(r["AWD Installed"]).trim().toLowerCase() === "yes",
      crm: String(r.CRM).trim().toLowerCase() === "yes",
    },
    geometry: fieldPolygon(r.Longitude, r.Latitude, acres, r.Farmer_ID || id),
  };
});

const fc = { type: "FeatureCollection", features };
fs.writeFileSync(path.join(__dirname, "..", "fields.geo.json"), JSON.stringify(fc));

console.log("VILLAGES =", JSON.stringify(VILLAGES, null, 2));
console.log("total fields:", features.length);
console.log("total villages:", VILLAGES.length);
