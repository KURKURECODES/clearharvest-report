/* ============================================================================
   ClearHarvestMap - real basemap drill-down
   India -> Telangana -> Nizamabad -> village -> single farmer field
   ----------------------------------------------------------------------------
   STACK
     maplibre-gl   real vector basemap, camera animation (flyTo / fitBounds)
     framer-motion breadcrumbs, detail panel, legend transitions

   INSTALL
     npm i maplibre-gl
     import "maplibre-gl/dist/maplibre-gl.css";   // required, once, app-wide

   DATA
     boundaries.geo.json  India outline, Telangana, Nizamabad district.
                          Derived from GADM district polygons: Telangana is
                          dissolved from the ten districts it was formed from
                          in 2014, since most public datasets still pre-date
                          the split and file it under Andhra Pradesh.
     fields.geo.json      309 farmer fields as real lat/lon polygons.
                          REPLACE with your FieldKhata KML export - convert
                          Placemark -> Feature and keep these properties:
                          id, farmer, acres, village, villageName, block,
                          awd, crm.

   BASEMAP AND INDIAN BOUNDARIES - read before shipping
     The default style below (CARTO Positron) is OSM-derived and depicts the
     Line of Control in Jammu & Kashmir per international convention, not
     India's official claim line. Maps published in India are expected to show
     the full claimed boundary. For a deliverable circulating in India, point
     BASEMAP_STYLE at an India-compliant source - Mappls (MapmyIndia) or Google
     Maps served with region=IN - or clear the current basemap with your legal
     team. Swapping it is a one-line change.
============================================================================ */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
// maplibre-gl v5 ships named exports only - no default export.
import { Map as MLMap, Marker, Popup, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
// MapLibre resolves its tile-parsing worker script relative to its own
// bundled chunk's import.meta.url at runtime - a pattern bundlers can't
// statically detect. Worse, the worker file itself does a relative
// `import ... from "./maplibre-gl-shared.mjs"`, so even a `?url` static
// asset copy of just the worker breaks it (the shared chunk never ships
// alongside it, and the missing-file request 404s inside the worker,
// which never surfaces on the main thread - the map just hangs on
// "loading" forever). Both files are vendored into public/maplibre/ as an
// unhashed, unbundled pair so the relative import between them keeps
// working, and setWorkerUrl points MapLibre at that copy directly.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

import BOUNDARIES from "./boundaries.geo.json";
import FIELDS_FC from "./fields.geo.json";

/* --- swap this for an India-compliant basemap before publishing in India --- */
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const C = {
  ink: "#0A1F16", field: "#0E5B33", leaf: "#4FA65B", water: "#1E88A8",
  husk: "#C98A2E", clay: "#8C5A3C", paper: "#EEF3EC", paperDim: "#DFE8DD",
  line: "#C3D3C1", mute: "#5C7264",
};
const EASE = [0.22, 0.61, 0.36, 1];
const FONT_DATA = "'IBM Plex Mono', ui-monospace, monospace";

const VILLAGES = [
  { key: "ghanpur",    name: "Ghanpur",    lon: 77.9271, lat: 18.5734, block: "Chandur" },
  { key: "sangam",     name: "Sangam",     lon: 77.9121, lat: 18.6038, block: "Chandur" },
  { key: "kunipoor",   name: "Kunipoor",   lon: 77.9406, lat: 18.5111, block: "Varni"   },
  { key: "srinagar",   name: "Srinagar",   lon: 77.9253, lat: 18.5371, block: "Varni"   },
  { key: "bhavanipet", name: "Bhavanipet", lon: 77.9251, lat: 18.5801, block: "Chandur" },
];

/* Camera stops. Bounds beat hardcoded zooms - they stay correct on any
   container aspect ratio, which a fixed zoom does not. */
const CAMERA = {
  india:     { bounds: [[68.1, 6.7], [97.4, 35.6]], padding: 40 },
  telangana: { bounds: [[77.2, 15.8], [81.8, 19.9]], padding: 56 },
  district:  { bounds: [[77.5, 18.0], [78.7, 19.0]], padding: 56 },
};
const LEVELS = ["india", "telangana", "district", "village"];
const LEVEL_LABEL = { india: "India", telangana: "Telangana", district: "Nizamabad district", village: "Village" };

const featById  = (id) => FIELDS_FC.features.find((f) => f.properties.id === id);
const villageFC = (key) => ({
  type: "FeatureCollection",
  features: FIELDS_FC.features.filter((f) => f.properties.village === key),
});
const villageCount = (key) => FIELDS_FC.features.filter((f) => f.properties.village === key).length;
const TOTAL_FIELDS = FIELDS_FC.features.length;

/** Bounding box of a FeatureCollection, for fitBounds. */
function fcBounds(fc) {
  let w = 180, s = 90, e = -180, n = -90;
  fc.features.forEach((f) =>
    f.geometry.coordinates[0].forEach(([x, y]) => {
      if (x < w) w = x; if (x > e) e = x;
      if (y < s) s = y; if (y > n) n = y;
    })
  );
  return [[w, s], [e, n]];
}

/* ----------------------------------------------------------------------------
   MAP
   One MapLibre instance for the whole drill-down. Layers are added once on
   load; level changes only move the camera and toggle layer visibility, which
   is far smoother than tearing sources down and rebuilding them.
---------------------------------------------------------------------------- */
function DrillMap({ level, village, selected, onPickState, onPickVillage, onPickField, onHoverField }) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [ready, setReady] = useState(false);
  const popup = useRef(null);
  // map event handlers are bound once on load; this ref gives them a live
  // read of the current level without re-binding on every level change
  const levelRef = useRef(level);
  useEffect(() => { levelRef.current = level; }, [level]);

  /* --- init ------------------------------------------------------------- */
  useEffect(() => {
    if (map.current) return;
    const m = new MLMap({
      container: holder.current,
      style: BASEMAP_STYLE,
      bounds: CAMERA.india.bounds,
      fitBoundsOptions: { padding: CAMERA.india.padding },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 17,
    });
    map.current = m;
    m.on("error", (e) => console.error("MapLibre error:", e?.error || e));
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
    popup.current = new Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "ch-popup" });

    m.on("load", () => {
      const bd = (id) => ({
        type: "Feature",
        properties: {},
        geometry: BOUNDARIES.features.find((f) => f.properties.id === id).geometry,
      });

      /* Telangana - the clickable state */
      m.addSource("telangana", { type: "geojson", data: bd("telangana") });
      m.addLayer({ id: "tg-fill", type: "fill", source: "telangana",
        paint: { "fill-color": C.field, "fill-opacity": 0.34 } });
      m.addLayer({ id: "tg-line", type: "line", source: "telangana",
        paint: { "line-color": C.field, "line-width": 1.8 } });

      /* Nizamabad district */
      m.addSource("nizamabad", { type: "geojson", data: bd("nizamabad") });
      m.addLayer({ id: "nz-fill", type: "fill", source: "nizamabad",
        paint: { "fill-color": C.husk, "fill-opacity": 0 } });
      m.addLayer({ id: "nz-line", type: "line", source: "nizamabad",
        paint: { "line-color": C.husk, "line-width": 2, "line-opacity": 0 } });

      /* farmer fields - one source, filtered per village */
      m.addSource("fields", { type: "geojson", data: FIELDS_FC, promoteId: "id" });
      m.addLayer({
        id: "fld-fill", type: "fill", source: "fields", filter: ["==", ["get", "village"], ""],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false], C.husk,
            ["boolean", ["feature-state", "hover"], false], C.leaf,
            ["get", "awd"], C.field,
            C.mute,
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.95,
            ["boolean", ["feature-state", "hover"], false], 0.85,
            0.55,
          ],
        },
      });
      m.addLayer({ id: "fld-line", type: "line", source: "fields",
        filter: ["==", ["get", "village"], ""],
        paint: { "line-color": "#ffffff", "line-width": 1 } });

      /* click targets
         MapLibre dispatches a click to every layer under the pointer, so the
         Telangana fill (which stays in the scene, dimmed, at every level)
         would otherwise fire underneath a field click and fly the camera back
         out. Guard: only accept the state click at the two levels where it
         means anything, and bail if a field is under the cursor. */
      m.on("click", "tg-fill", (e) => {
        if (levelRef.current !== "india" && levelRef.current !== "telangana") return;
        const overField = m.queryRenderedFeatures(e.point, { layers: ["fld-fill"] });
        if (overField.length) return;
        onPickState();
      });
      m.on("mouseenter", "tg-fill", () => {
        if (levelRef.current === "india" || levelRef.current === "telangana") {
          m.getCanvas().style.cursor = "pointer";
        }
      });
      m.on("mouseleave", "tg-fill", () => (m.getCanvas().style.cursor = ""));

      let hovered = null;
      m.on("mousemove", "fld-fill", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        if (hovered && hovered !== f.id) m.setFeatureState({ source: "fields", id: hovered }, { hover: false });
        hovered = f.id;
        m.setFeatureState({ source: "fields", id: hovered }, { hover: true });
        onHoverField(f.properties.id);
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:${FONT_DATA};font-size:11px;line-height:1.6">
               <div style="font-weight:600;font-size:12.5px;color:${C.ink}">${f.properties.farmer}</div>
               <div style="color:${C.mute}">${f.properties.id} - ${f.properties.acres} acres</div>
             </div>`
          )
          .addTo(m);
      });
      m.on("mouseleave", "fld-fill", () => {
        m.getCanvas().style.cursor = "";
        if (hovered) m.setFeatureState({ source: "fields", id: hovered }, { hover: false });
        hovered = null;
        onHoverField(null);
        popup.current.remove();
      });
      /* clicking bare map (not on a parcel) clears the pin */
      m.on("click", (e) => {
        if (levelRef.current !== "village") return;
        if (m.queryRenderedFeatures(e.point, { layers: ["fld-fill"] }).length) return;
        onPickField(null);
      });

      m.on("click", "fld-fill", (e) => {
        e.preventDefault();                       // don't let it reach tg-fill
        e.originalEvent.stopPropagation();
        onPickField(e.features[0].properties.id); // pins it - camera does NOT move
      });

      setReady(true);
    });

    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- camera + layer visibility per level ------------------------------ */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const showDistrict = level === "district" || level === "village";
    m.setPaintProperty("nz-fill", "fill-opacity", showDistrict ? 0.14 : 0);
    m.setPaintProperty("nz-line", "line-opacity", showDistrict ? 1 : 0);
    m.setPaintProperty("tg-fill", "fill-opacity", level === "india" ? 0.34 : level === "telangana" ? 0.22 : 0.1);

    // all 309 fields render as soon as you're at district level or deeper -
    // not only after clicking a village pin - so panning/zooming manually
    // into any village shows its parcels immediately.
    m.setFilter("fld-fill", showDistrict ? true : ["==", ["get", "village"], ""]);
    m.setFilter("fld-line", showDistrict ? true : ["==", ["get", "village"], ""]);

    if (level === "village" && village) {
      m.fitBounds(fcBounds(villageFC(village)), { padding: 70, duration: 1800, essential: true });
    } else {
      const cam = CAMERA[level] || CAMERA.india;
      m.fitBounds(cam.bounds, { padding: cam.padding, duration: 1800, essential: true });
    }
  }, [level, village, ready]);

  /* --- village pins ----------------------------------------------------- */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    if (level !== "district") return;

    VILLAGES.forEach((v) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", `${v.name} - ${villageCount(v.key)} fields`);
      el.style.cssText = `display:flex;align-items:center;gap:7px;background:${C.ink};color:#fff;
        border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:5px 11px 5px 7px;
        font-family:${FONT_DATA};font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;
        box-shadow:0 6px 18px -8px rgba(0,0,0,.6);transition:transform .2s ease,background .2s ease`;
      el.innerHTML = `<span style="width:8px;height:8px;border-radius:99px;background:${C.husk};display:inline-block"></span>
        ${v.name.toUpperCase()} <span style="opacity:.6">${villageCount(v.key)}</span>`;
      el.onmouseenter = () => { el.style.transform = "scale(1.07)"; el.style.background = C.field; };
      el.onmouseleave = () => { el.style.transform = "none"; el.style.background = C.ink; };
      el.onclick = () => onPickVillage(v.key);
      markers.current.push(new Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m));
    });
  }, [level, ready, onPickVillage]);

  /* --- selection feature-state ------------------------------------------ */
  const prevSel = useRef(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (prevSel.current) m.setFeatureState({ source: "fields", id: prevSel.current }, { selected: false });
    if (selected) m.setFeatureState({ source: "fields", id: selected }, { selected: true });
    prevSel.current = selected;
  }, [selected, ready]);

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      <div ref={holder} style={{ width: "100%", height: "clamp(380px, 56vh, 620px)" }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: C.paperDim }}>
          <span style={{ fontFamily: FONT_DATA, fontSize: 10.5, letterSpacing: ".12em", color: C.mute }}>
            LOADING BASEMAP...
          </span>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   PANEL + CHROME
---------------------------------------------------------------------------- */
function Row({ k, v, accent }) {
  return (
    <div className="flex justify-between gap-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
      <span style={{ fontFamily: FONT_DATA, fontSize: 10.5, color: "rgba(255,255,255,.5)", letterSpacing: ".08em" }}>
        {k.toUpperCase()}
      </span>
      <span style={{ fontSize: 13.5, color: accent || "#fff", fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Crumbs({ level, village, onGo }) {
  const trail = [
    { key: "india", label: "India" },
    { key: "telangana", label: "Telangana" },
    { key: "district", label: "Nizamabad" },
  ];
  if (level === "village" && village) {
    trail.push({ key: "village", label: VILLAGES.find((v) => v.key === village)?.name });
  }
  const idx = LEVELS.indexOf(level);
  return (
    <LayoutGroup id="map-crumbs">
      <div className="flex flex-wrap items-center gap-1.5">
        {trail.map((t, i) => (
          <React.Fragment key={t.key}>
            {i > 0 && <span style={{ color: C.line, fontSize: 11, fontFamily: FONT_DATA }}>/</span>}
            <motion.button
              onClick={() => i <= idx && onGo(t.key)}
              disabled={i > idx}
              className="relative px-2.5 py-1 rounded"
              style={{ fontFamily: FONT_DATA, fontSize: 10.5, letterSpacing: ".08em", fontWeight: 600,
                       color: i === idx ? "#fff" : C.mute, cursor: i <= idx ? "pointer" : "default" }}
            >
              {i === idx && (
                <motion.span layoutId="map-crumb-pill" className="absolute inset-0 rounded"
                  style={{ background: C.field }} transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
              <span className="relative">{t.label?.toUpperCase()}</span>
            </motion.button>
          </React.Fragment>
        ))}
      </div>
    </LayoutGroup>
  );
}

function Panel({ level, village, field, hoverField }) {
  const v = VILLAGES.find((x) => x.key === village);
  // hover previews the field; the pinned (clicked) field persists once the pointer leaves
  const f = featById(hoverField || field);

  let body;
  if (level === "village" && f) {
    const p = f.properties;
    body = (
      <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: EASE }}>
        <div className="flex items-center gap-2" style={{ fontFamily: FONT_DATA, fontSize: 11, color: C.husk, letterSpacing: ".18em", fontWeight: 600 }}>
          FARMER FIELD - KML POLYGON
          {field === p.id && (
            <span style={{ background: C.husk, color: C.ink, borderRadius: 3, padding: "1px 5px", fontSize: 9, letterSpacing: ".1em" }}>
              PINNED
            </span>
          )}
        </div>
        <h3 className="mt-4" style={{ color: "#fff", fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.1 }}>{p.farmer}</h3>
        <div className="mt-5">
          <Row k="Field ID" v={p.id} />
          <Row k="Area" v={`${p.acres} acres`} accent={C.leaf} />
          <Row k="Village" v={p.villageName} />
          <Row k="Block" v={p.block} />
          <Row k="AWD pipe" v={p.awd ? "Installed & logged" : "Not enrolled"} accent={p.awd ? C.leaf : "rgba(255,255,255,.5)"} />
          <Row k="Residue" v={p.crm ? "Baled - no burning" : "Retained in field"} accent={p.crm ? C.husk : undefined} />
        </div>
        <p className="mt-5" style={{ fontFamily: FONT_DATA, fontSize: 10.5, color: "rgba(255,255,255,.45)", lineHeight: 1.7 }}>
          Boundary captured by the Kisan Advisor in FieldKhata and quality-checked by the scientific team before GHG accounting.
        </p>
      </motion.div>
    );
  } else if (level === "village" && v) {
    body = (
      <motion.div key={v.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: EASE }}>
        <div style={{ fontFamily: FONT_DATA, fontSize: 11, color: C.husk, letterSpacing: ".18em", fontWeight: 600 }}>
          {v.block.toUpperCase()} BLOCK
        </div>
        <h3 className="mt-4" style={{ color: "#fff", fontWeight: 700, fontSize: "1.75rem" }}>{v.name}</h3>
        <div className="mt-5">
          <Row k="Mapped fields" v={villageCount(v.key)} accent={C.leaf} />
          <Row k="Coordinates" v={`${v.lat.toFixed(4)}°N ${v.lon.toFixed(4)}°E`} />
          <Row k="District" v="Nizamabad, Telangana" />
        </div>
        <p className="mt-5" style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,.7)" }}>
          Hover any polygon for the farmer's name and area; click to pin it.
        </p>
      </motion.div>
    );
  } else {
    body = (
      <motion.div key={level} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: EASE }}>
        <div style={{ fontFamily: FONT_DATA, fontSize: 11, color: C.husk, letterSpacing: ".18em", fontWeight: 600 }}>
          {LEVEL_LABEL[level].toUpperCase()}
        </div>
        <h3 className="mt-4" style={{ color: "#fff", fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.1 }}>
          {level === "india" ? "Where the rice comes from" : level === "telangana" ? "Telangana" : "Nizamabad district"}
        </h3>
        <div className="mt-5">
          <Row k="Mapped fields" v={TOTAL_FIELDS} accent={C.leaf} />
          <Row k="Villages" v={`${VILLAGES.length} of 11`} />
          <Row k="Blocks" v="Varni & Chandur" />
          <Row k="Emission reduction" v="771.47 kg CO2e/MT" accent={C.leaf} />
        </div>
        <p className="mt-5" style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,.7)" }}>
          {level === "india"
            ? "Telangana is highlighted below - click the state to drop into Nizamabad district."
            : level === "telangana"
            ? "Click again to zoom to Nizamabad, where all 300 enrolled fields were geofenced."
            : "Open a village pin to see every mapped farmer field."}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="p-7 md:p-8 rounded-lg h-full" style={{ background: C.ink, minHeight: 420 }}>
      <AnimatePresence mode="wait" initial={false}>{body}</AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   SECTION - drop-in replacement for the SVG LocationSection
---------------------------------------------------------------------------- */
export default function LocationSection() {
  const [level, setLevel] = useState("india");
  const [village, setVillage] = useState(null);
  const [field, setField] = useState(null);
  const [hoverField, setHoverField] = useState(null);

  const goto = useCallback((key) => {
    setLevel(key);
    setField(null);
    setHoverField(null);
    if (key !== "village") setVillage(null);
  }, []);

  const pickVillage = useCallback((key) => { setVillage(key); setLevel("village"); setField(null); }, []);
  const pickState = useCallback(() => setLevel((l) => (l === "india" ? "telangana" : "district")), []);

  const legend = level === "village"
    ? [[C.field, "AWD field"], [C.leaf, "Hovered"], [C.husk, "Selected"], [C.mute, "Not enrolled"]]
    : null;

  return (
    <section id="location" className="px-5 md:px-10 py-20 md:py-28" style={{ background: C.paper }}>
      <div className="mx-auto" style={{ maxWidth: 1180 }}>
        <div className="mb-10 md:mb-14">
          <div className="flex items-baseline gap-4">
            <span style={{ fontFamily: FONT_DATA, fontSize: 13, color: C.husk, fontWeight: 600 }}>02</span>
            <span style={{ flex: 1, height: 1, background: C.line }} />
          </div>
          <h2 className="mt-4" style={{ color: C.field, fontWeight: 800, fontSize: "clamp(1.9rem,4vw,3rem)", letterSpacing: "-.03em", lineHeight: 1, maxWidth: "22ch" }}>
            Every field on the map
          </h2>
          <p className="mt-5" style={{ color: C.mute, maxWidth: "62ch", lineHeight: 1.65, fontSize: "1.05rem" }}>
            The programme ran in the Varni and Chandur blocks of Nizamabad district, Telangana. All 300 enrolled
            farmer fields were geofenced as KML boundaries in FieldKhata - click Telangana to drill from the country
            down to a single plot.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <Crumbs level={level} village={village} onGo={goto} />
              <AnimatePresence>
                {level !== "india" && (
                  <motion.button
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    onClick={() => goto(LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)])}
                    className="px-3 py-1.5 rounded"
                    style={{ fontFamily: FONT_DATA, fontSize: 10, letterSpacing: ".1em", color: C.mute, border: `1px solid ${C.line}` }}
                  >
                    &larr; ZOOM OUT
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <DrillMap
              level={level}
              village={village}
              selected={field}
              onPickState={pickState}
              onPickVillage={pickVillage}
              onPickField={setField}
              onHoverField={setHoverField}
            />

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              {legend
                ? legend.map(([c, l]) => (
                    <span key={l} className="flex items-center gap-2" style={{ fontFamily: FONT_DATA, fontSize: 10, color: C.mute }}>
                      <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
                      {l.toUpperCase()}
                    </span>
                  ))
                : VILLAGES.map((v) => (
                    <motion.button
                      key={v.key}
                      onClick={() => pickVillage(v.key)}
                      whileHover={{ y: -2 }}
                      style={{ fontFamily: FONT_DATA, fontSize: 10.5, color: C.field, fontWeight: 600, letterSpacing: ".05em" }}
                    >
                      {v.name.toUpperCase()} <span style={{ color: C.mute }}>{villageCount(v.key)}</span>
                    </motion.button>
                  ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Panel level={level} village={village} field={field} hoverField={hoverField} />
          </div>
        </div>
      </div>
    </section>
  );
}
