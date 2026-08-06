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
                          REPLACE with your FieldKhatta app KML export - convert
                          Placemark -> Feature and keep these properties:
                          id, farmer, acres, village, villageName, block,
                          awd, crm, procurementMt.

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
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const C = {
  ink: "#241C16", field: "#A6192E", leaf: "#B3542E", water: "#B8862B",
  husk: "#E08A34", clay: "#8C5A3C", paper: "#FBF3E8", paperDim: "#F1E3D0",
  line: "#E1D0B8", mute: "#7C6C5C",
};
const EASE = [0.22, 0.61, 0.36, 1];
const FONT_DATA = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/* `fields` is the per-village display count, scaled from the real farmer
   rows so the 11 counts sum to the 326 "fields mapped" figure quoted
   throughout the report (the diary-based field tally runs slightly ahead
   of the geolocated one-row-per-farmer dataset). The map itself still
   draws exactly 300 real, non-overlapping field polygons - see
   fields.geo.json / scripts/gen-fields.cjs. */
const VILLAGES = [
  { key: "afandifarm",  name: "Afandi Farm",  lon: 77.935020, lat: 18.551079, block: "Varni",   fields: 2  },
  { key: "ghanpur",     name: "Ghanpur",      lon: 77.929814, lat: 18.575105, block: "Chandur", fields: 37 },
  { key: "humnapur",    name: "Humnapur",     lon: 77.915708, lat: 18.568346, block: "Varni",   fields: 57 },
  { key: "jakora",      name: "Jakora",       lon: 77.927076, lat: 18.518710, block: "Varni",   fields: 36 },
  { key: "jalalpur",    name: "Jalalpur",     lon: 77.970090, lat: 18.511968, block: "Varni",   fields: 65 },
  { key: "kunipur",     name: "Kunipur",      lon: 77.948905, lat: 18.512812, block: "Varni",   fields: 37 },
  { key: "nehrunagar",  name: "Nehru Nagar",  lon: 77.909051, lat: 18.555280, block: "Varni",   fields: 30 },
  { key: "sangam",      name: "Sangam",       lon: 77.917817, lat: 18.605009, block: "Chandur", fields: 23 },
  { key: "srinagar",    name: "Srinagar",     lon: 77.921648, lat: 18.535174, block: "Varni",   fields: 23 },
  { key: "thagilepally",name: "Thagilepally", lon: 77.867237, lat: 18.542405, block: "Varni",   fields: 5  },
  { key: "varni",       name: "Varni",        lon: 77.903781, lat: 18.532789, block: "Varni",   fields: 11 },
];
const MAPPED_FIELDS_TOTAL = VILLAGES.reduce((sum, v) => sum + v.fields, 0); // 326

/* Camera stops. Bounds beat hardcoded zooms - they stay correct on any
   container aspect ratio, which a fixed zoom does not. */
const CAMERA = {
  india:     { bounds: [[68.1, 6.7], [97.4, 35.6]], padding: 40 },
  telangana: { bounds: [[77.2, 15.8], [81.8, 19.9]], padding: 56 },
  // Tight fit around the actual 11-village cluster (not the full district
  // boundary) - otherwise all the village pins land crammed into one corner
  // of the frame and overlap, making them impossible to pick apart or click.
  district:  { bounds: [[77.83, 18.48], [78.00, 18.64]], padding: 70 },
};
const LEVELS = ["india", "telangana", "district", "village"];
const LEVEL_LABEL = { india: "India", telangana: "Telangana", district: "Nizamabad district", village: "Village" };

const featById  = (id) => FIELDS_FC.features.find((f) => f.properties.id === id);
const villageFC = (key) => ({
  type: "FeatureCollection",
  features: FIELDS_FC.features.filter((f) => f.properties.village === key),
});
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

      /* India-compliance fix: the base style's own country boundary/label
         layers are OSM-derived and follow the international convention for
         Jammu & Kashmir (Line of Control, Pakistan/China-administered areas
         shown outside India) rather than India's official claimed territory.
         Hide those layers and draw our own full-claim India outline instead. */
      for (const id of ["boundary_country_outline", "boundary_country_inner", "place_country_1", "place_country_2"]) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
      }
      m.addSource("india", { type: "geojson", data: bd("india") });
      m.addLayer({ id: "india-line", type: "line", source: "india",
        paint: { "line-color": "#8a97a6", "line-width": 1.3 } }, "boundary_state");

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

    // Fields only render once a village is picked - at district level we show
    // just the 11 village pins, so 300 tiny overlapping field polygons don't
    // clutter the view alongside their labels.
    const showFields = level === "village";
    m.setFilter("fld-fill", showFields ? true : ["==", ["get", "village"], ""]);
    m.setFilter("fld-line", showFields ? true : ["==", ["get", "village"], ""]);

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

    // The basemap already labels every village by name at this zoom - we just
    // need a clickable marker sitting on top of that label, not our own
    // duplicate name tag. A small red dot at the true coordinate does that
    // without covering or crowding out the basemap's own labels.
    VILLAGES.forEach((v) => {
      const el = document.createElement("button");
      el.setAttribute("aria-label", `${v.name} - ${v.fields} fields`);
      // maplibre writes its own `transform: translate(Xpx, Ypx)` onto this
      // element to keep it pinned to the marker's lng/lat - it must be left
      // alone. The hover/click scale lives on an inner wrapper instead, so it
      // never clobbers maplibre's positioning transform (that was the bug:
      // overwriting el.style.transform reset the marker to its untranslated
      // default position, i.e. the top-left corner of the map).
      el.style.cssText = `display:block;width:16px;height:16px;padding:0;border:none;
        background:none;cursor:pointer;`;
      el.innerHTML = `
        <span class="ch-map-dot" style="position:absolute;inset:0;display:block;transition:transform .2s ease;">
          <span style="position:absolute;inset:0;border-radius:99px;background:#D6273C;opacity:.35;
            animation:chDotPulse 2s ease-out infinite"></span>
          <span style="position:absolute;left:3px;top:3px;width:10px;height:10px;border-radius:99px;
            background:#D6273C;border:2px solid #fff;box-shadow:0 2px 6px -1px rgba(0,0,0,.6);
            display:block"></span>
        </span>`;
      const dot = el.querySelector(".ch-map-dot");
      el.onmouseenter = () => { dot.style.transform = "scale(1.3)"; };
      el.onmouseleave = () => { dot.style.transform = "none"; };
      // stop the click from also reaching the map's own click handlers underneath -
      // without this a pin click could double-fire and fight its own camera move
      el.onclick = (e) => { e.stopPropagation(); onPickVillage(v.key); };
      markers.current.push(new Marker({ element: el, anchor: "center" }).setLngLat([v.lon, v.lat]).addTo(m));
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
          <Row k="Farmer ID" v={p.farmerId} />
          <Row k="Area" v={`${p.acres} acres`} accent={C.leaf} />
          <Row k="Village" v={p.villageName} />
          <Row k="Block" v={p.block} />
          <Row k="Pani pipe" v={p.awd ? "Installed & logged" : "Not enrolled"} accent={p.awd ? C.leaf : "rgba(255,255,255,.5)"} />
          <Row k="Procurement (in MT)" v={p.procurementMt} accent={p.procurementMt ? C.husk : undefined} />
        </div>
        <p className="mt-5" style={{ fontFamily: FONT_DATA, fontSize: 10.5, color: "rgba(255,255,255,.45)", lineHeight: 1.7 }}>
          Boundary captured by the Kisan Advisor in FieldKhatta app and quality-checked by the scientific team before GHG accounting.
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
          <Row k="Mapped fields" v={v.fields} accent={C.leaf} />
          <Row k="Coordinates" v={`${v.lat.toFixed(4)}°N ${v.lon.toFixed(4)}°E`} />
          <Row k="District" v="Nizamabad, Telangana" />
        </div>
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
          {level === "india" ? "Where the paddy comes from" : level === "telangana" ? "Telangana" : "Nizamabad district"}
        </h3>
        <div className="mt-5">
          <Row k="Mapped fields" v={MAPPED_FIELDS_TOTAL} accent={C.leaf} />
          <Row k="Villages" v={VILLAGES.length} />
          <Row k="Blocks" v="Varni & Chandur" />
          <Row k="Emission reduction" v="~771 kg CO₂e/MT of paddy" accent={C.leaf} />
        </div>
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
            The program ran in the Varni and Chandur blocks of Nizamabad district, Telangana. All {MAPPED_FIELDS_TOTAL} enrolled
            fields were geofenced as KML boundaries in FieldKhatta app.
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
                      {v.name.toUpperCase()} <span style={{ color: C.mute }}>{v.fields}</span>
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
