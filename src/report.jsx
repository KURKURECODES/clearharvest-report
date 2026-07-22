/* ============================================================================
   ClearHarvest - Low-Emission Rice Offtake  ·  Interactive Project Report
   Grow Indigo Pvt. Ltd.  |  Nizamabad, Telangana  |  Nov 2026 – Apr 2026
   ----------------------------------------------------------------------------
   RUNTIME NOTE (read me first)
   The brief asked for framer-motion + react-simple-maps. Neither ships with
   this preview runtime, so both are replaced by tiny, dependency-free
   equivalents that expose the same mental model:

     framer-motion      -> <Reveal>  (IntersectionObserver + CSS transitions)
                           useCountUp / useScrollProgress hooks
     react-simple-maps  -> <IndiaMap> (hand-projected GeoJSON-style rings;
                           same [lon, lat] data shape react-simple-maps eats)

   To go back to the real libraries in your own repo, see SWAP-IN comments
   marked  ⟵ SWAP.  Recharts and Tailwind are used exactly as briefed.
   ========================================================================== */

import React, { useState, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";

/* ----------------------------------------------------------------------------
   1 · DESIGN TOKENS
   Palette is drawn from the field itself: flooded-paddy water, wet silt, husk,
   young leaf. Tailwind is used for layout only (no arbitrary values available
   in this runtime), so brand colour lives in inline style objects.
---------------------------------------------------------------------------- */
const C = {
  ink: "#0A1F16",        // deep wet-soil green-black - page floor
  field: "#0E5B33",      // Grow Indigo forest green - headings, chrome
  leaf: "#4FA65B",       // young paddy leaf - positive deltas
  water: "#1E88A8",      // AWD tube water - the scroll signature
  waterDeep: "#12566B",
  husk: "#C98A2E",       // dried straw / amber - cautions + data accents
  clay: "#8C5A3C",
  paper: "#EEF3EC",      // cool pale green-grey (not cream)
  paperDim: "#DFE8DD",
  line: "#C3D3C1",
  mute: "#5C7264",
};

const FONT_DISPLAY = "'Bricolage Grotesque', 'Archivo', system-ui, sans-serif";
const FONT_BODY = "'Inter Tight', 'Inter', system-ui, sans-serif";
const FONT_DATA = "'IBM Plex Mono', ui-monospace, monospace";

/* Web fonts + the handful of keyframes the page needs. Injected once. */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Inter+Tight:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      .ch-root { font-family: ${FONT_BODY}; background: ${C.paper}; color: ${C.ink}; }
      .ch-display { font-family: ${FONT_DISPLAY}; letter-spacing: -0.03em; line-height: 0.98; }
      .ch-data { font-family: ${FONT_DATA}; font-variant-numeric: tabular-nums; }

      /* Reveal: the single motion primitive. Opacity + travel, nothing else. */
      .ch-reveal { opacity: 0; transform: translate3d(0, 22px, 0);
        transition: opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1); }
      .ch-reveal.is-in { opacity: 1; transform: none; }

      /* Hover discoverability: the drawer that drops out of each intervention */
      .ch-drawer { display: grid; grid-template-rows: 0fr;
        transition: grid-template-rows .45s cubic-bezier(.22,.61,.36,1); }
      .ch-drawer > div { overflow: hidden; }
      .ch-card:hover .ch-drawer, .ch-card:focus-within .ch-drawer, .ch-card.is-open .ch-drawer { grid-template-rows: 1fr; }

      .ch-ripple { animation: chRipple 4.5s ease-in-out infinite; transform-origin: center; }
      @keyframes chRipple { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(.82) } }

      .ch-pulse { animation: chPulse 2.6s ease-out infinite; }
      @keyframes chPulse { 0% { r: 6; opacity: .55 } 100% { r: 26; opacity: 0 } }

      .ch-caret { animation: chCaret 1.9s ease-in-out infinite; }
      @keyframes chCaret { 0%,100% { transform: translateY(0); opacity:.5 } 50% { transform: translateY(7px); opacity:1 } }

      .ch-root ::selection { background: ${C.husk}; color: #fff; }
      .ch-root :focus-visible { outline: 2px solid ${C.water}; outline-offset: 3px; border-radius: 2px; }
      .ch-scroll::-webkit-scrollbar { height: 6px; }
      .ch-scroll::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 99px; }

      @media (prefers-reduced-motion: reduce) {
        .ch-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        .ch-ripple, .ch-pulse, .ch-caret { animation: none !important; }
      }
    `}</style>
  );
}

/* ----------------------------------------------------------------------------
   2 · MOTION PRIMITIVES  (stand-ins for framer-motion)
---------------------------------------------------------------------------- */

/** Fires once when the element crosses into view. The trigger for every
 *  fade-up on the page - charts and counters listen to it too. */
function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect(); // reveal once - re-animating on scroll-back feels cheap
        }
      },
      { threshold: options.threshold ?? 0.18, rootMargin: options.rootMargin ?? "0px 0px -8% 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [options.threshold, options.rootMargin]);
  return [ref, inView];
}

/** <Reveal delay={120}>…</Reveal>  ⟵ SWAP: motion.div whileInView={{opacity:1,y:0}} */
function Reveal({ children, delay = 0, as: Tag = "div", className = "", style, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={`ch-reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Counts 0 → value once the card is on screen. Eased, so it settles rather
 *  than stops dead. Honours prefers-reduced-motion by snapping to the value. */
function useCountUp(value, { duration = 1500, decimals = 0, start } = {}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!start) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setDisplay(value);
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, start]);
  return decimals ? display.toFixed(decimals) : Math.round(display).toLocaleString("en-IN");
}

/** 0 → 1 down the whole document. Drives the progress rule and the AWD gauge. */
function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return p;
}

/* ----------------------------------------------------------------------------
   3 · SHARED PRIMITIVES
---------------------------------------------------------------------------- */

function Eyebrow({ children, color = C.husk, className = "" }) {
  return (
    <div
      className={`ch-data text-xs uppercase ${className}`}
      style={{ color, letterSpacing: "0.18em", fontWeight: 600 }}
    >
      {children}
    </div>
  );
}

function SectionHead({ index, title, lede, tone = "light" }) {
  const fg = tone === "dark" ? "#fff" : C.field;
  const body = tone === "dark" ? "rgba(255,255,255,.72)" : C.mute;
  return (
    <div className="mb-10 md:mb-14">
      <Reveal>
        <div className="flex items-baseline gap-4">
          <span className="ch-data text-sm" style={{ color: C.husk, fontWeight: 600 }}>
            {index}
          </span>
          <span
            className="flex-1"
            style={{ height: 1, background: tone === "dark" ? "rgba(255,255,255,.18)" : C.line }}
          />
        </div>
      </Reveal>
      <Reveal delay={70}>
        <h2
          className="ch-display mt-4 text-3xl md:text-5xl"
          style={{ color: fg, fontWeight: 800, maxWidth: "22ch" }}
        >
          {title}
        </h2>
      </Reveal>
      {lede && (
        <Reveal delay={140}>
          <p className="mt-5 text-base md:text-lg" style={{ color: body, maxWidth: "62ch", lineHeight: 1.65 }}>
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}

function Section({ id, children, tone = "light", className = "" }) {
  return (
    <section
      id={id}
      className={`px-5 md:px-10 py-20 md:py-28 ${className}`}
      style={{ background: tone === "dark" ? C.ink : tone === "tint" ? C.paperDim : C.paper }}
    >
      <div className="mx-auto" style={{ maxWidth: 1180 }}>
        {children}
      </div>
    </section>
  );
}

/** Field-photo vernacular: the GPS Map Camera stamp burned into every image in
 *  the source report. Reused for evidence cards so the provenance stays visible. */
function GeoStamp({ place, coords, when, className = "" }) {
  return (
    <div className={`ch-data ${className}`} style={{ fontSize: 10.5, lineHeight: 1.5, color: "rgba(255,255,255,.9)" }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{place}</div>
      <div style={{ opacity: 0.8 }}>{coords}</div>
      <div style={{ opacity: 0.8 }}>{when}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   4 · SIGNATURE ELEMENT - the AWD field tube
   The whole programme turns on one object: a perforated pipe sunk into the
   paddy, read by hand. It becomes the page's scroll indicator. Water rises and
   falls through the report the way it does through a wetting–drying cycle, and
   the "safe re-irrigation" line at 15 cm below surface is marked, as in the
   farmer training material.
---------------------------------------------------------------------------- */
function AwdGauge({ progress }) {
  // Wetting–drying: three full cycles across the document, never fully dry.
  const cycle = (Math.sin(progress * Math.PI * 6 - Math.PI / 2) + 1) / 2; // 0..1
  const level = 18 + cycle * 62; // % of tube filled
  const depth = (15 - cycle * 15).toFixed(1); // cm below surface, 15 → 0

  return (
    <div
      className="fixed z-40 hidden lg:flex flex-col items-center gap-2"
      style={{ right: 26, top: "50%", transform: "translateY(-50%)" }}
      aria-hidden="true"
    >
      <div className="ch-data" style={{ fontSize: 9, letterSpacing: ".14em", color: C.mute }}>
        AWD TUBE
      </div>
      <svg width="46" height="190" viewBox="0 0 46 190">
        <defs>
          <clipPath id="tubeClip">
            <rect x="12" y="10" width="22" height="168" rx="11" />
          </clipPath>
        </defs>
        {/* tube body */}
        <rect x="12" y="10" width="22" height="168" rx="11" fill="#fff" stroke={C.line} />
        {/* water column */}
        <g clipPath="url(#tubeClip)">
          <rect
            x="12"
            y={178 - (168 * level) / 100}
            width="22"
            height={(168 * level) / 100}
            fill={C.water}
            opacity="0.85"
            style={{ transition: "y .25s linear, height .25s linear" }}
          />
          <rect
            className="ch-ripple"
            x="12"
            y={178 - (168 * level) / 100 - 3}
            width="22"
            height="6"
            fill={C.waterDeep}
            opacity="0.5"
          />
        </g>
        {/* perforations - the pipe is drilled so field water can enter */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle key={i} cx="23" cy={30 + i * 19} r="1.6" fill={C.field} opacity="0.35" />
        ))}
        {/* safe re-irrigation threshold */}
        <line x1="6" y1="132" x2="40" y2="132" stroke={C.husk} strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <div className="ch-data text-center" style={{ fontSize: 10, color: C.field, fontWeight: 600 }}>
        −{depth} cm
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   5 · CHROME - progress rule + section jump
---------------------------------------------------------------------------- */
const NAV = [
  ["summary", "Summary"],
  ["location", "Location"],
  ["interventions", "Interventions"],
  ["governance", "Governance"],
  ["benefits", "AWD benefits"],
  ["results", "Results"],
  ["season", "Season"],
  ["economics", "Economics"],
  ["sourcing", "Sourcing"],
  ["evidence", "Evidence"],
];

function TopBar({ progress }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: solid ? "rgba(10,31,22,.94)" : "transparent",
        backdropFilter: solid ? "blur(10px)" : "none",
        transition: "background .35s ease",
      }}
    >
      <div className="flex items-center gap-4 px-5 md:px-10" style={{ height: 58 }}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="ch-display text-left"
          style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-.02em" }}
        >
          clear<span style={{ color: C.husk }}>harvest</span>
        </button>
        <nav className="ch-scroll flex-1 hidden md:flex gap-1 overflow-x-auto">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className="ch-data px-2 py-1 rounded"
              style={{ fontSize: 10.5, letterSpacing: ".08em", color: "rgba(255,255,255,.62)", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.62)")}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="ch-data ml-auto md:ml-0" style={{ fontSize: 10, color: "rgba(255,255,255,.45)" }}>
          PRIVATE &amp; CONFIDENTIAL
        </div>
      </div>
      <div style={{ height: 2, background: "rgba(255,255,255,.12)" }}>
        <div style={{ height: 2, width: `${progress * 100}%`, background: C.husk, transition: "width .1s linear" }} />
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------------------
   6 · HERO
   Thesis, not decoration: a flooded field that drains as the page loads - the single practice the whole programme rests on, stated in one line.
---------------------------------------------------------------------------- */
function Hero() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex flex-col justify-end" style={{ minHeight: "100vh", background: C.ink }}>
      {/* ambient paddy horizon */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1200 800" aria-hidden="true">
        <defs>
          <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A1F16" />
            <stop offset="62%" stopColor="#0E3324" />
            <stop offset="100%" stopColor="#12566B" />
          </linearGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#skyG)" />
        {/* water sheet that recedes on load = AWD in one gesture */}
        <rect
          x="0"
          y="620"
          width="1200"
          height="180"
          fill={C.water}
          opacity={loaded ? 0.16 : 0.42}
          style={{ transition: "opacity 2.4s ease 0.6s" }}
        />
        {/* rice rows */}
        {Array.from({ length: 46 }).map((_, i) => {
          const x = 20 + i * 26;
          const h = 46 + ((i * 37) % 40);
          return (
            <g key={i} opacity={loaded ? 0.5 : 0} style={{ transition: `opacity 1.2s ease ${0.5 + i * 0.02}s` }}>
              <path d={`M${x} 720 q4 -${h} 10 -${h + 12}`} stroke={C.leaf} strokeWidth="1.4" fill="none" opacity=".7" />
              <path d={`M${x} 720 q-6 -${h - 10} -14 -${h}`} stroke={C.leaf} strokeWidth="1.2" fill="none" opacity=".5" />
            </g>
          );
        })}
      </svg>

      <div className="relative px-5 md:px-10 pb-16 md:pb-24 pt-32 mx-auto w-full" style={{ maxWidth: 1180 }}>
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(18px)",
            transition: "opacity .9s ease, transform .9s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          <Eyebrow color={C.husk}>Project report · Rabi 2026 · Implementation partner Grow Indigo</Eyebrow>
          <h1
            className="ch-display mt-6"
            style={{ color: "#fff", fontWeight: 800, fontSize: "clamp(2.6rem, 8vw, 6.4rem)", maxWidth: "16ch" }}
          >
            Low-Emission
            <br />
            Rice Offtake
            <span style={{ color: C.husk }}>.</span>
          </h1>
          <p
            className="mt-7 text-lg md:text-xl"
            style={{ color: "rgba(255,255,255,.78)", maxWidth: "56ch", lineHeight: 1.6 }}
          >
            300 paddy farmers across 1,718 acres in Nizamabad stopped flooding their fields
            continuously - and cut the carbon in every tonne of rice by half.
          </p>

          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
            {[
              ["Reporting period", "Nov 2026 – Apr 2026"],
              ["Prepared for", "ABC"],
              ["Geography", "Varni & Chandur blocks, Telangana"],
              ["Quantification", "Cool Farm Platform V3.0"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="ch-data" style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(255,255,255,.45)" }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ color: "#fff", fontWeight: 500, fontSize: 15, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative pb-8 flex justify-center" aria-hidden="true">
        <svg className="ch-caret" width="20" height="26" viewBox="0 0 20 26">
          <path d="M10 2v20M3 15l7 7 7-7" stroke="rgba(255,255,255,.6)" strokeWidth="1.4" fill="none" />
        </svg>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   7 · IMPACT COUNTERS
   Each card counts up the first time it enters the viewport (useInView →
   useCountUp). Footnotes carry the provenance so no number floats free.
---------------------------------------------------------------------------- */
const HEADLINES = [
  { value: 300, suffix: "", label: "Paddy farmers", note: "enrolled across 23 villages", tone: C.field },
  { value: 1718, suffix: "", label: "Acres under AWD", note: "Varni & Chandur blocks, Nizamabad", tone: C.field },
  { value: 51, suffix: "%", label: "GHG reduction", note: "vs ABC baseline of 1,325 kg CO₂e/MT", tone: C.leaf },
  { value: 45, prefix: "~", suffix: "%", label: "Water saved", note: "3,250 → ~1,788 litres per kg paddy", tone: C.water },
  { value: 600, suffix: "", label: "Acres baled", note: "double the 300-acre CRM target", tone: C.husk },
  { value: 26, suffix: "%", label: "Less nitrogen", note: "48 → 35.6 kg N/acre vs PJTSAU dose", tone: C.clay },
];

function StatCard({ stat, delay }) {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const n = useCountUp(stat.value, { start: inView, duration: 1400 + delay });
  return (
    <div
      ref={ref}
      className="p-6 md:p-7 rounded-lg"
      style={{
        background: "#fff",
        border: `1px solid ${C.line}`,
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(20px)",
        transition: `opacity .6s ease ${delay}ms, transform .6s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
      }}
    >
      <div className="ch-display" style={{ color: stat.tone, fontWeight: 800, fontSize: "clamp(2.2rem,5vw,3.2rem)" }}>
        {stat.prefix || ""}
        {n}
        {stat.suffix || ""}
      </div>
      <div className="mt-1" style={{ fontWeight: 600, fontSize: 15, color: C.ink }}>
        {stat.label}
      </div>
      <div className="ch-data mt-2" style={{ fontSize: 11, color: C.mute, lineHeight: 1.6 }}>
        {stat.note}
      </div>
    </div>
  );
}

function ImpactStrip() {
  return (
    <Section id="summary" tone="tint">
      <SectionHead
        index="01"
        title="What the season delivered"
        lede="The ABC Low-Emission Rice Offtake Project promoted Alternate Wetting & Drying (AWD)–based regenerative practices that cut greenhouse gas emissions, improved water-use efficiency and strengthened long-term soil health - verified farm to mill."
      />
      <div className="grid gap-4 md:gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {HEADLINES.map((s, i) => (
          <StatCard key={s.label} stat={s} delay={i * 90} />
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-3 mt-14">
        <Reveal className="lg:col-span-2">
          <h3 className="ch-display text-2xl md:text-3xl" style={{ color: C.field, fontWeight: 700 }}>
            Why this project exists
          </h3>
          <p className="mt-4" style={{ lineHeight: 1.75, color: C.ink, maxWidth: "68ch" }}>
            Rice is one of the most water-intensive crops on earth, and traditional flooded cultivation is a
            significant source of methane - while exposing farmers to erratic rainfall, rising temperatures and
            declining groundwater. Against that backdrop the project introduced a set of regenerative interventions
            focused on <strong>water</strong>, <strong>soil</strong> and <strong>implementation competencies</strong>.
          </p>
          <p className="mt-4" style={{ lineHeight: 1.75, color: C.mute, maxWidth: "68ch" }}>
            Participating farmers kept their prevailing rice establishment method. The single change at the centre of
            the programme was irrigation: AWD replaced continuous flooding with monitored wetting–drying cycles to
            conserve water and suppress methane formation. Everything else - biologicals, residue management, digital
            traceability - was built around making that change stick and making it auditable.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="p-6 rounded-lg h-full" style={{ background: C.ink }}>
            <Eyebrow color={C.husk}>The claim, in one line</Eyebrow>
            <p className="ch-display mt-4 text-xl md:text-2xl" style={{ color: "#fff", fontWeight: 600, lineHeight: 1.25 }}>
              A scalable, farmer-centric model for low-emission rice that is transparent, traceable and ready for
              climate-aligned procurement.
            </p>
            <div className="ch-data mt-6 pt-4" style={{ fontSize: 11, color: "rgba(255,255,255,.55)", borderTop: "1px solid rgba(255,255,255,.15)", lineHeight: 1.7 }}>
              419 farmers enrolled · 249 completed procurement · 16 sampled for quantification by the square-root method
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   8 · PROJECT LOCATION - interactive map
   ⟵ SWAP: <ComposableMap projection="geoMercator"><Geographies geography={IN_TOPO}>
      … react-simple-maps consumes the same [lon, lat] rings used below, so the
      geometry constants drop straight into a TopoJSON/GeoJSON feature.
---------------------------------------------------------------------------- */
const BBOX = { lon0: 67.0, lon1: 98.5, lat0: 5.5, lat1: 37.5 };
const MAP_W = 560;
const MAP_H = 640;

/** Equirectangular projection with a cos(mid-latitude) correction - enough
 *  fidelity for a locator map and zero network dependency. */
function project([lon, lat]) {
  const x = ((lon - BBOX.lon0) / (BBOX.lon1 - BBOX.lon0)) * MAP_W;
  const y = ((BBOX.lat1 - lat) / (BBOX.lat1 - BBOX.lat0)) * MAP_H;
  return [x, y];
}
const ring = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${project(p).map((n) => n.toFixed(1)).join(" ")}`).join(" ") + " Z";

const INDIA = [
  [74.0, 34.6], [76.6, 35.5], [78.4, 34.6], [79.5, 33.0], [80.1, 30.5], [81.6, 30.3],
  [84.0, 28.6], [86.2, 27.6], [88.1, 27.3], [88.9, 26.9], [89.6, 26.2], [92.0, 27.8],
  [95.4, 28.0], [97.3, 28.2], [96.6, 27.0], [97.1, 25.4], [94.6, 24.0], [93.4, 23.0],
  [92.5, 22.0], [91.5, 22.8], [89.5, 21.8], [88.0, 21.6], [87.0, 21.5], [85.5, 19.8],
  [84.5, 19.0], [82.5, 17.0], [80.5, 15.8], [80.2, 13.5], [79.8, 11.9], [79.3, 10.3],
  [78.2, 9.2], [77.5, 8.1], [76.5, 9.0], [75.8, 11.5], [74.8, 13.5], [73.8, 15.5],
  [72.9, 18.5], [72.6, 20.0], [72.9, 21.8], [70.0, 20.8], [69.0, 22.3], [68.2, 23.7],
  [70.5, 24.5], [71.0, 26.0], [72.5, 27.5], [73.5, 29.5], [74.6, 31.0], [74.0, 32.5],
];

const TELANGANA = [
  [77.3, 19.9], [78.6, 19.9], [79.9, 19.6], [80.6, 18.8], [80.9, 17.8], [80.3, 17.0],
  [79.5, 15.95], [78.5, 15.9], [77.7, 16.5], [77.3, 17.3], [76.85, 18.35],
];

const NIZAMABAD = [78.09, 18.67];
const PROJECT_PIN = [77.93, 18.53]; // Varni / Chandur cluster

function IndiaMap({ active, setActive }) {
  const on = active;
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto" role="img" aria-label="Map of India with Telangana highlighted">
      <defs>
        <linearGradient id="tgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.leaf} />
          <stop offset="100%" stopColor={C.field} />
        </linearGradient>
      </defs>

      {/* national outline */}
      <path d={ring(INDIA)} fill={C.paperDim} stroke={C.line} strokeWidth="1.2" strokeLinejoin="round" />

      {/* Telangana - the only interactive geography on the map */}
      <path
        d={ring(TELANGANA)}
        fill={on ? "url(#tgGrad)" : C.field}
        fillOpacity={on ? 1 : 0.62}
        stroke="#fff"
        strokeWidth="1.4"
        style={{ cursor: "pointer", transition: "fill-opacity .3s ease, transform .4s cubic-bezier(.22,.61,.36,1)", transformOrigin: "center", transform: on ? "scale(1.03)" : "none" }}
        tabIndex={0}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onClick={() => setActive((v) => !v)}
        aria-label="Telangana - project state"
      />

      {/* project pin + ping */}
      {(() => {
        const [px, py] = project(PROJECT_PIN);
        const [nx, ny] = project(NIZAMABAD);
        return (
          <g>
            <circle className="ch-pulse" cx={px} cy={py} r="6" fill={C.husk} />
            <circle cx={px} cy={py} r="5" fill={C.husk} stroke="#fff" strokeWidth="1.5" />
            <line x1={px} y1={py} x2={px + 96} y2={py - 74} stroke={C.husk} strokeWidth="1" strokeDasharray="2 3" />
            <text x={px + 100} y={py - 76} className="ch-data" fontSize="11" fill={C.field} fontWeight="600">
              Nizamabad
            </text>
            <text x={px + 100} y={py - 62} className="ch-data" fontSize="9.5" fill={C.mute}>
              {NIZAMABAD[1].toFixed(2)}°N {NIZAMABAD[0].toFixed(2)}°E
            </text>
            <circle cx={nx} cy={ny} r="2" fill={C.field} />
          </g>
        );
      })()}

      <text x="16" y={MAP_H - 14} className="ch-data" fontSize="9.5" fill={C.mute}>
        HOVER OR TAP TELANGANA
      </text>
    </svg>
  );
}

function LocationSection() {
  const [active, setActive] = useState(false);
  return (
    <Section id="location">
      <SectionHead
        index="02"
        title="One district, twenty-three villages"
        lede="The programme ran in the Varni and Chandur blocks of Nizamabad district, Telangana - a groundwater-dependent rice bowl where continuous flooding is the default and the case for AWD is strongest."
      />
      <div className="grid gap-10 lg:grid-cols-2 items-center">
        <Reveal>
          <div className="p-4 md:p-8 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <IndiaMap active={active} setActive={setActive} />
          </div>
        </Reveal>

        <Reveal delay={120}>
          {/* Side panel: cross-fades between the resting brief and the detail
              payload the moment Telangana becomes active. */}
          <div className="relative" style={{ minHeight: 330 }}>
            <div
              className="p-7 md:p-9 rounded-lg"
              style={{
                background: active ? C.ink : "#fff",
                border: `1px solid ${active ? C.ink : C.line}`,
                transition: "background .45s ease, border-color .45s ease",
              }}
            >
              <Eyebrow color={active ? C.husk : C.mute}>
                {active ? "Telangana · selected" : "Project geography"}
              </Eyebrow>

              <h3
                className="ch-display mt-4 text-2xl md:text-3xl"
                style={{ color: active ? "#fff" : C.field, fontWeight: 700, transition: "color .45s ease" }}
              >
                Nizamabad district
              </h3>
              <p
                className="mt-3"
                style={{ color: active ? "rgba(255,255,255,.78)" : C.mute, lineHeight: 1.7, transition: "color .45s ease" }}
              >
                Varni and Chandur blocks, covering 23 villages - including Ghanpur, Sangam, Kunipoor, Srinagar and
                Bhavanipet, where field evidence in this report was captured.
              </p>

              {/* the reveal payload */}
              <div
                className="ch-drawer mt-5"
                style={{ gridTemplateRows: active ? "1fr" : "0fr" }}
              >
                <div>
                  <div className="grid gap-4 sm:grid-cols-2 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,.18)" }}>
                    {[
                      ["679.13", "kg CO₂e/MT reduced", C.leaf],
                      ["26%", "nitrogen use optimised", C.husk],
                      ["1,718", "acres under practice", "#fff"],
                      ["16", "farmers sampled & quantified", "#fff"],
                    ].map(([v, l, col]) => (
                      <div key={l}>
                        <div className="ch-display" style={{ color: col, fontWeight: 800, fontSize: "1.9rem" }}>
                          {v}
                        </div>
                        <div className="ch-data mt-1" style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)", lineHeight: 1.55 }}>
                          {l}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="ch-data mt-5" style={{ fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
                    Emission reduction quantified on the Cool Farm Platform V3.0 against ABC's baseline of
                    1,325 kg CO₂e/MT and reviewed by a third-party auditor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   9 · THE THREE INTERVENTIONS
   Hover (or focus, or tap on touch) opens the mechanism drawer - the "how it
   actually works" text stays out of the way until asked for.
---------------------------------------------------------------------------- */
const INTERVENTIONS = [
  {
    key: "water",
    tag: "Theme 1 · Water",
    title: "Alternate Wetting & Drying",
    kicker: "1 perforated field pipe per acre, read by hand",
    color: C.water,
    icon: (
      <path d="M12 2s7 8.2 7 12.6A7 7 0 1 1 5 14.6C5 10.2 12 2 12 2z" fill="currentColor" />
    ),
    mechanism:
      "AWD replaces continuous flooding with a controlled cycle of irrigation and drying. A perforated field water tube is sunk into each acre; irrigation is scheduled by watching the water level fall inside the tube rather than by calendar habit. Kisan Advisors measured levels manually through the season, so farmers learned to read the pipe themselves.",
    why: [
      ["Water intensity", "Rice needs ~3,250 litres to produce 1 kg of paddy."],
      ["Water scarcity", "By 2025, 20 million hectares of irrigated rice globally may face scarcity."],
      ["Methane", "Flooded fields are a major methane source; drying limits the anaerobic conditions that create it."],
    ],
    benefits: [
      "~45% water savings - down to ~1,788 litres per kg of paddy",
      "Lower methane emissions through reduced waterlogging",
      "Improved root aeration and nutrient uptake",
      "Enhanced water productivity and groundwater management",
      "Decreased weed pressure in certain field conditions",
      "Healthier soil structure - less prolonged saturation stress",
      "Farmer-friendly monitoring via a simple tube",
      "Climate resilience where irrigation is scarce",
    ],
  },
  {
    key: "soil",
    tag: "Theme 2 · Soil",
    title: "Oorjit & Grow Phos",
    kicker: "6 kg + 20 kg per acre, supplied free of cost",
    color: C.leaf,
    icon: (
      <path d="M12 21c0-6 3-10 8-11 0 7-3 11-8 11zM12 21C12 15 9 11 4 10c0 7 3 11 8 11z" fill="currentColor" />
    ),
    mechanism:
      "An advanced microbial NPK consortium biofertiliser: nitrogen-fixing, phosphorus-solubilising and potash-mobilising bacteria enriched with naturally derived soil minerals. It adds plant-beneficial microbes to the crop rhizosphere, lifting soil biological activity and nutrient-use efficiency. Every farmer received a 6 kg bag of Oorjit granules and a 20 kg bag of Grow Phos - one acre's worth - plus training on correct application.",
    why: [
      ["Nutrient efficiency", "Biological availability lets the same crop run on less applied nitrogen."],
      ["Cost", "Inputs were supplied at no cost, so adoption carried no added expense."],
      ["Stacking", "Paired with AWD, better aeration compounds the nutrient-uptake gain."],
    ],
    benefits: [
      "Steady biologically-driven N-P-K supply; up to 20% less synthetic fertiliser dependence",
      "Improved soil structure - aeration, moisture retention, root penetration",
      "Lower urea requirement, subject to soil condition, crop stage and agronomic advice",
      "Consistent vegetative growth and quality grain formation",
      "Lower disease incidence and better long-term soil health",
    ],
  },
  {
    key: "crm",
    tag: "Theme 3 · Residue",
    title: "Crop Residue Management",
    kicker: "600 acres baled against a 300-acre target",
    color: C.husk,
    icon: (
      <path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" fill="none" />
    ),
    mechanism:
      "CRM was implemented to eliminate open field burning. Selected farmers were supported in baling and bundling rice residues immediately after harvest, so straw was collected, removed or repurposed instead of burnt. Where residues are retained, mulched, composted or incorporated, biomass nutrients recycle back into the soil and may reduce synthetic nitrogen needs in later seasons. Where residues are baled and removed, the gains are cleaner fields, avoided burning and productive biomass use - urea replacement must be assessed against the specific CRM pathway and soil tests.",
    why: [
      ["Air quality", "Burning releases particulate matter, CO₂, methane and nitrous oxide."],
      ["Soil biota", "Field fires damage soil life and destroy organic carbon."],
      ["Income", "Baled straw has a buyer - local cowsheds and gaushalas."],
    ],
    benefits: [
      "New income stream from selling baled residue to gaushalas",
      "Target exceeded - 100% growth over the original 300-acre plan",
      "Higher soil organic matter; organic carbon retained rather than burnt",
      "Biomass reused as livestock feed, compost and bioenergy",
      "Reduced air pollution and fire risk across the project villages",
    ],
  },
];

function InterventionCard({ item, delay }) {
  const [open, setOpen] = useState(false); // tap support on touch devices
  return (
    <Reveal delay={delay}>
      <div
        className={`ch-card rounded-lg h-full p-7 md:p-8 ${open ? "is-open" : ""}`}
        style={{
          background: "#fff",
          border: `1px solid ${C.line}`,
          borderTop: `3px solid ${item.color}`,
          cursor: "pointer",
          transition: "box-shadow .35s ease, transform .35s cubic-bezier(.22,.61,.36,1)",
        }}
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((v) => !v))}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = "0 18px 40px -24px rgba(10,31,22,.45)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <svg width="34" height="34" viewBox="0 0 24 24" style={{ color: item.color }}>
            {item.icon}
          </svg>
          <Eyebrow color={item.color}>{item.tag}</Eyebrow>
        </div>

        <h3 className="ch-display mt-6 text-2xl" style={{ color: C.field, fontWeight: 700 }}>
          {item.title}
        </h3>
        <div className="ch-data mt-2" style={{ fontSize: 11.5, color: C.mute }}>
          {item.kicker}
        </div>

        {/* MECHANISM DRAWER - opens on hover / focus-within / tap */}
        <div className="ch-drawer">
          <div>
            <p className="mt-5" style={{ lineHeight: 1.7, fontSize: 14.5, color: C.ink }}>
              {item.mechanism}
            </p>
            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
              {item.why.map(([k, v]) => (
                <div key={k} className="mb-2.5">
                  <span className="ch-data" style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>
                    {k.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13.5, color: C.mute, marginLeft: 8 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-6 space-y-2">
          {item.benefits.map((b) => (
            <li key={b} className="flex gap-3" style={{ fontSize: 14, lineHeight: 1.6, color: C.ink }}>
              <span style={{ color: item.color, fontWeight: 700 }}>▸</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="ch-data mt-6" style={{ fontSize: 10, color: C.mute, letterSpacing: ".1em" }}>
          {open ? "TAP TO CLOSE" : "HOVER OR TAP FOR THE MECHANISM"}
        </div>
      </div>
    </Reveal>
  );
}

function InterventionsSection() {
  return (
    <Section id="interventions" tone="tint">
      <SectionHead
        index="03"
        title="Three interventions, one system"
        lede="Water, soil and residue were addressed together - each one supported by the same field team, the same digital record and the same farmer. Hover any card to open its mechanism."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {INTERVENTIONS.map((it, i) => (
          <InterventionCard key={it.key} item={it} delay={i * 110} />
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   10 · GOVERNANCE - team structure, responsibilities, competencies
---------------------------------------------------------------------------- */
const ROLES = [
  ["Project Management Unit", [
    "Strategic supervision and governance",
    "Alignment with ABC's sustainability and reporting requirements",
    "Smooth execution throughout the programme, including procurement and reporting",
  ]],
  ["RBM / Agronomist", [
    "Led on-ground implementation with TBM and Kisan Advisors",
    "Technical guidance on AWD, IPM, INM and sustainability practices",
    "Farmer trainings on AWD, regenerative practices and use of biologicals",
    "Quality assurance of field data and practice verification",
  ]],
  ["TBM (Territory Business Manager)", [
    "Supervised Kisan Advisors daily",
    "Full coordination during procurement with the miller",
    "Implementation of AWD, CRM (baling & bundling), nutrient management and biologicals",
    "Adherence to implementation timelines and technical protocols",
  ]],
  ["Kisan Advisors", [
    "Farmer engagement and mobilisation across project villages",
    "Distributed biologicals and AWD pipes to farmers",
    "KML-based mapping of farmer fields in the app",
    "Built awareness of AWD, CRM, nutrient management and biologicals",
    "Field visits and hands-on implementation support",
    "Manual measurement of water level in fields",
  ]],
  ["Scientists", [
    "Reviewed and validated field data for methodological accuracy",
    "Scientific oversight on agronomy methodologies and regenerative protocols",
    "Quality checks on KML mapping of farmer fields",
    "GHG emission quantification and water-saving assessments from field-level data",
  ]],
  ["Engineering Leads", [
    "Developed and maintained the digital tools - FieldKhata and S3 Sutra",
    "Data accuracy, security and seamless flow across platforms",
    "Troubleshooting, field adoption and technology readiness",
    "Digital traceability and audit-trail generation from farm to mill",
  ]],
];

function OrgChart() {
  const node = (label, sub, bg, fg = "#fff") => (
    <div className="px-4 py-3 rounded" style={{ background: bg, color: fg, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      {sub && (
        <div className="ch-data mt-1" style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
  return (
    <div className="p-6 md:p-8 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <Eyebrow>ClearHarvest team structure</Eyebrow>
      <div className="mt-6 flex flex-col items-center">
        {node("PMU", "Project Management Unit · timely execution against milestones", C.field)}
        <div style={{ width: 1, height: 22, background: C.line }} />
        <div className="grid gap-4 sm:grid-cols-2 w-full">
          <div>
            {node("Field Operations", null, C.leaf)}
            <div className="mt-3 space-y-3">
              {node("RBM / Agronomist", "Regional field leadership & agronomic guidance", C.paperDim, C.ink)}
              {node("TBM", "Team management & operational execution", C.paperDim, C.ink)}
              {node("Kisan Advisors", "Farmer engagement, advisory & hand-holding", C.paperDim, C.ink)}
            </div>
          </div>
          <div>
            {node("Science & Technology", null, C.water)}
            <div className="mt-3 space-y-3">
              {node("Quantification Lead", "GHG quantification, data analysis & impact assessment", C.paperDim, C.ink)}
              {node("Engineering Lead", "Digital tools, data systems & technology enablement", C.paperDim, C.ink)}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6" style={{ fontSize: 13.5, lineHeight: 1.7, color: C.mute }}>
        Field execution was led by the Regional Business Manager / Agronomist, who oversaw technical implementation and
        agronomic fidelity across the project area, supported by the Territory Business Manager on day-to-day oversight,
        farmer coordination and operational planning. At ground level, Kisan Advisors worked directly with farmers to
        drive adoption, monitor fields and protect the integrity of data collection.
      </p>
    </div>
  );
}

function RoleAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-6 py-4" style={{ background: C.field }}>
        <Eyebrow color="rgba(255,255,255,.7)">Functional responsibility mapping</Eyebrow>
      </div>
      {ROLES.map(([role, duties], i) => {
        const isOpen = open === i;
        return (
          <div key={role} style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="w-full flex items-center gap-4 px-6 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span
                className="ch-data"
                style={{ fontSize: 11, color: C.husk, fontWeight: 600, width: 22 }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontWeight: 600, fontSize: 15, color: isOpen ? C.field : C.ink, flex: 1 }}>{role}</span>
              <span
                style={{
                  color: C.mute,
                  transform: isOpen ? "rotate(45deg)" : "none",
                  transition: "transform .3s ease",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                +
              </span>
            </button>
            <div className="ch-drawer" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
              <div>
                <ul className="px-6 pb-5 space-y-2" style={{ paddingLeft: 68 }}>
                  {duties.map((d) => (
                    <li key={d} className="flex gap-3" style={{ fontSize: 14, lineHeight: 1.6, color: C.mute }}>
                      <span style={{ color: C.leaf }}>▸</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const WORKFLOW = [
  ["Kisan Advisor visits the farmer", "On-field engagement and practice verification"],
  ["Capability building on interventions", "Training on AWD, CRM and biological inputs"],
  ["Data capture on agronomic practices", "AWD and CRM logged in FieldKhata"],
  ["QC of field-reported data by scientists", "Methodological review and validation"],
  ["Procurement audit trail", "End-to-end record captured in S3 Sutra"],
  ["Third-party audit & report submission", "Independent verification and final delivery"],
];

function WorkflowStepper() {
  const [hover, setHover] = useState(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {WORKFLOW.map(([title, sub], i) => {
        const on = hover === i;
        return (
          <div
            key={title}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="p-5 rounded"
            style={{
              background: on ? C.field : "#fff",
              border: `1px solid ${on ? C.field : C.line}`,
              transition: "background .3s ease, border-color .3s ease, transform .3s ease",
              transform: on ? "translateY(-3px)" : "none",
            }}
          >
            <div className="ch-data" style={{ fontSize: 11, fontWeight: 600, color: on ? C.husk : C.husk }}>
              STEP {i + 1}
            </div>
            <div className="mt-2" style={{ fontWeight: 600, fontSize: 14.5, color: on ? "#fff" : C.ink }}>
              {title}
            </div>
            <div className="mt-1.5" style={{ fontSize: 12.5, lineHeight: 1.6, color: on ? "rgba(255,255,255,.72)" : C.mute }}>
              {sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const IPM = [
  ["Cultural control", "Timely agronomic operations, field sanitation, balanced nutrition, weed management and AWD-based water management."],
  ["Mechanical & physical", "Removal of infected plant parts, cleaning of field bunds, physical suppression of weeds and pest habitats."],
  ["Biological control", "Biological inputs and practices that improved soil and crop health and encouraged beneficial organisms."],
  ["Chemical control", "Recommended only when pest or disease pressure required it - correct pesticide, dosage and crop stage."],
];

function GovernanceSection() {
  return (
    <Section id="governance">
      <SectionHead
        index="04"
        title="Who did what, and how it was checked"
        lede="Delivery ran through a layered implementation architecture. Strategic oversight sat with Grow Indigo's ClearHarvest team, keeping the programme aligned to ABC's sustainability objectives and reporting requirements."
      />
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Reveal>
          <OrgChart />
        </Reveal>
        <Reveal delay={120}>
          <RoleAccordion />
        </Reveal>
      </div>

      <div className="mt-16">
        <Reveal>
          <h3 className="ch-display text-2xl md:text-3xl" style={{ color: C.field, fontWeight: 700 }}>
            Monitoring, measurement and traceability
          </h3>
          <p className="mt-4" style={{ lineHeight: 1.75, color: C.mute, maxWidth: "72ch" }}>
            Grow Indigo ran a phygital monitoring system: regular field observation paired with digital capture.
            Farmer information, field boundary geofencing and agronomy records (fertiliser, pesticide use, irrigation
            method) went into <strong style={{ color: C.ink }}>FieldKhata</strong>; the agronomist and scientific team
            then checked accuracy, completeness and geolocation consistency before anything reached GHG accounting.
            Post-harvest, <strong style={{ color: C.ink }}>S3 Sutra</strong> traced low-emission paddy from farm to
            miller - farmer validation, produce quantities and movement - and a third-party auditor reviewed the
            evidence and digital records.
          </p>
        </Reveal>
        <Reveal delay={100} className="mt-7">
          <WorkflowStepper />
        </Reveal>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <Eyebrow>Theme 4 · Programme competencies</Eyebrow>
            <h4 className="ch-display mt-4 text-xl" style={{ color: C.field, fontWeight: 700 }}>
              Four IPM principles, applied in the field
            </h4>
            <div className="mt-5 space-y-4">
              {IPM.map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{k}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: C.mute }}>{v}</div>
                </div>
              ))}
            </div>
            <p className="ch-data mt-5 pt-4" style={{ fontSize: 11.5, lineHeight: 1.7, color: C.mute, borderTop: `1px solid ${C.line}` }}>
              Regular monitoring by Kisan Advisors kept crop-protection decisions tied to actual field conditions
              rather than routine pesticide application.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <Eyebrow>Farmer hand-holding</Eyebrow>
            <h4 className="ch-display mt-4 text-xl" style={{ color: C.field, fontWeight: 700 }}>
              A high-touch, phygital extension model
            </h4>
            <div className="mt-5 space-y-4" style={{ fontSize: 14, lineHeight: 1.7, color: C.mute }}>
              <p>
                <strong style={{ color: C.ink }}>Integrated Nutrient Management.</strong> Nutrient decisions combined
                farmer practice, crop-stage requirements, biological inputs, soil condition and split application of
                fertilisers - with Oorjit and Grow Phos as biological complements optimising nitrogen and phosphorus
                availability.
              </p>
              <p>
                <strong style={{ color: C.ink }}>Field visits.</strong> Kisan Advisors visited from transplanting to
                harvest: one-on-one support, on-field troubleshooting, verification of AWD practice, nutrient
                management, crop protection and correct application of biologicals.
              </p>
              <p>
                <strong style={{ color: C.ink }}>Village-level meetings.</strong> Held four times in the project period,
                with live demonstrations of AWD pipe installation, biological application and residue management.
                Biological-team members joined every VLM and leaflets were distributed.
              </p>
              <p>
                <strong style={{ color: C.ink }}>Always-on channels.</strong> Vernacular video on Grow Indigo's YouTube
                learning platform plus weekly WhatsApp messages in Telugu - including pest advisories naming the Kisan
                Advisor to call.
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={80} className="mt-6">
        <div className="p-7 rounded-lg" style={{ background: C.ink }}>
          <Eyebrow color={C.husk}>Stakeholder management</Eyebrow>
          <p className="mt-3" style={{ color: "rgba(255,255,255,.8)", lineHeight: 1.75, maxWidth: "80ch" }}>
            Field teams, scientists, Aishwarya Rice Mills (ABC's empanelled miller) and ABC representatives worked in a
            connected framework - enabling timely execution, transparent data flow and high implementation fidelity.
            The TBM and Kisan Advisors supervised the entire procurement process, and the PMU visited fields to ensure
            timely completion.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   11 · EIGHT BENEFITS OF AWD
   One practice, cascading effects. Tiles expand on hover so the section reads
   as a summary first and a reference second.
---------------------------------------------------------------------------- */
const AWD_BENEFITS = [
  ["Water conservation", C.water, [
    "Reduces irrigation water demand by 30–45% versus continuous flooding without compromising yield",
    "Project achieved ~45% water savings - ~1,788 litres per kg of paddy against a ~3,250 litre baseline",
    "Preserves groundwater reserves and reduces pumping load on shared aquifers",
    "Lets irrigation cycles be planned around critical stages: tillering, panicle initiation, milking",
  ]],
  ["Climate change mitigation", C.field, [
    "Lowers the greenhouse-gas footprint of rice, a globally significant agricultural emission source",
    "Project delivered 679.13 kg CO₂e/MT reduction - 51% against ABC's baseline of 1,325 kg CO₂e/MT",
    "Cuts diesel and electric pumping, reducing fossil-fuel emissions across the value chain",
    "Builds systems that tolerate erratic monsoons, heat waves and drought stress",
  ]],
  ["Reduced methane", C.clay, [
    "Periodic drying disrupts the anaerobic conditions that drive methanogenic microbial activity",
    "AWD can reduce methane emissions by 30–70% per hectare relative to continuously flooded systems (IRRI, IPCC AR6)",
    "Methane is ~28× more potent than CO₂ over 100 years, so each tonne avoided carries outsized benefit",
    "Combined with optimised nitrogen, nitrous oxide co-emissions are also controlled",
  ]],
  ["Soil health", C.leaf, [
    "Wet–dry cycles improve aeration and stimulate aerobic microbial activity that flooding suppresses",
    "Better root penetration and stronger root systems from improved oxygen in the rhizosphere",
    "Enhanced mineralisation increases plant-available nitrogen and phosphorus from native reserves",
    "Over multiple seasons, AWD plus biologicals builds soil organic carbon and water-holding capacity",
  ]],
  ["Biodiversity", "#6B8F3A", [
    "Alternating conditions diversify field micro-habitats versus monotonic flooding",
    "Lower chemical fertiliser and pesticide dependence protects pollinators, earthworms and pest predators",
    "Less water diverted from rivers and tanks helps preserve riparian and wetland ecosystems downstream",
    "Healthier soil biology competes with crop pathogens, reducing disease pressure naturally",
  ]],
  ["Energy savings", C.husk, [
    "Fewer irrigation events mean less pump runtime - lower electricity and diesel use",
    "Reduced pumping load cuts wear and maintenance on irrigation infrastructure",
    "At national scale, wide AWD adoption can ease peak agricultural electricity demand",
    "Indirect savings across the supply chain as fertiliser manufacturing and transport fall",
  ]],
  ["Human health", "#B0483C", [
    "Less standing water limits mosquito breeding sites for malaria, Japanese encephalitis and dengue",
    "Lower fertiliser leaching protects shallow rural wells from nitrate contamination",
    "Ending residue burning and cutting methane improves regional air quality and respiratory health",
    "Resilient livelihoods reduce rural distress and protect food, income and nutrition security",
  ]],
  ["Water governance", C.waterDeep, [
    "A simple, low-cost perforated tube lets farmers measure and manage their own water use",
    "Enables demand-side governance at village and watershed level, supporting collective irrigation planning",
    "Builds farmer capability in water-use scheduling as climate variability increases",
    "Creates a traceable, auditable record of water savings for climate finance and Scope 3 reporting",
  ]],
];

function BenefitTile({ title, color, points, i }) {
  return (
    <Reveal delay={(i % 4) * 80}>
      <div
        className="ch-card p-6 rounded-lg h-full"
        style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", transition: "background .3s ease" }}
        tabIndex={0}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.09)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.05)")}
      >
        <div className="flex items-center gap-3">
          <span style={{ width: 10, height: 10, borderRadius: 99, background: color, display: "inline-block" }} />
          <h4 className="ch-display text-lg" style={{ color: "#fff", fontWeight: 700 }}>
            {title}
          </h4>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.62)", marginTop: 10 }}>
          {points[0]}
        </div>
        <div className="ch-drawer">
          <div>
            <ul className="mt-3 space-y-2">
              {points.slice(1).map((p) => (
                <li key={p} className="flex gap-2.5" style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.72)" }}>
                  <span style={{ color }}>■</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function BenefitsSection() {
  return (
    <Section id="benefits" tone="dark">
      <SectionHead
        index="05"
        tone="dark"
        title="One practice, eight kinds of return"
        lede="AWD is a climate-smart, water-saving rice cultivation practice that delivers measurable environmental, agronomic, economic and social benefits - from an individual field to an entire watershed. Hover a tile to open the full evidence."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AWD_BENEFITS.map(([t, c, p], i) => (
          <BenefitTile key={t} title={t} color={c} points={p} i={i} />
        ))}
      </div>
      <Reveal delay={120} className="mt-8">
        <div className="p-7 md:p-9 rounded-lg text-center" style={{ background: C.field }}>
          <Eyebrow color={C.husk}>The big picture</Eyebrow>
          <p className="ch-display mt-4 mx-auto text-xl md:text-2xl" style={{ color: "#fff", fontWeight: 600, maxWidth: "44ch", lineHeight: 1.3 }}>
            AWD is a single practice with cascading positive impacts - saving water, reducing emissions, improving
            soils, protecting biodiversity, cutting energy costs, safeguarding health and strengthening community water
            governance.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   12 · RESULTS - animated Recharts, gated on viewport entry
   Each chart mounts only once its wrapper is in view, so Recharts' own
   animation doubles as the scroll-triggered reveal.
---------------------------------------------------------------------------- */
const EMISSIONS = [
  { name: "ABC baseline", value: 1325, fill: C.mute, note: "ABC's declared baseline for rice, kg CO₂e per MT" },
  { name: "Project · excl. nursery", value: 621.32, fill: C.leaf, note: "703.68 kg CO₂e/MT lower - a ~53% reduction" },
  { name: "Project · incl. nursery", value: 645.87, fill: C.field, note: "679.13 kg CO₂e/MT lower - 51%, the headline result" },
];

const NITROGEN = [
  { name: "Farmer practice (BAU)", value: 62.4, fill: C.clay, note: "Business-as-usual application in the project area" },
  { name: "PJTSAU recommended", value: 48, fill: C.mute, note: "University-recommended dose for the district" },
  { name: "Project rate", value: 35.6, fill: C.leaf, note: "26% below the recommended dose · 43% below BAU" },
];

const WATER = [
  { name: "Conventional flooding", value: 3250, fill: C.mute, note: "Litres of water per kg of paddy under continuous flooding" },
  { name: "Project (AWD)", value: 1788, fill: C.water, note: "Derived from the ~45% saving reported for the project" },
];

const YIELD = [
  { name: "Previous season", value: 2.7, fill: C.mute, note: "Average rice yield, MT" },
  { name: "Current season", value: 2.5, fill: C.husk, note: "Down ~7.4% - attributed to seasonal and agronomic factors" },
];

function ChartTip({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded p-3" style={{ background: C.ink, maxWidth: 260 }}>
      <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{d.name}</div>
      <div className="ch-display" style={{ color: d.fill, fontWeight: 800, fontSize: 22, marginTop: 2 }}>
        {d.value.toLocaleString("en-IN")} <span style={{ fontSize: 11, fontWeight: 500 }}>{unit}</span>
      </div>
      <div className="ch-data" style={{ color: "rgba(255,255,255,.62)", fontSize: 10.5, lineHeight: 1.6, marginTop: 6 }}>
        {d.note}
      </div>
    </div>
  );
}

function ChartFrame({ title, unit, kicker, children, height = 320, footnote }) {
  const [ref, inView] = useInView({ threshold: 0.25 });
  return (
    <div ref={ref} className="p-6 md:p-7 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <Eyebrow>{kicker}</Eyebrow>
      <h4 className="ch-display mt-3 text-xl md:text-2xl" style={{ color: C.field, fontWeight: 700 }}>
        {title}
      </h4>
      <div className="ch-data mt-1" style={{ fontSize: 11, color: C.mute }}>
        {unit}
      </div>
      <div style={{ height, marginTop: 18 }}>
        {inView ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : null}
      </div>
      {footnote && (
        <div className="ch-data mt-3 pt-3" style={{ fontSize: 10.5, color: C.mute, lineHeight: 1.6, borderTop: `1px solid ${C.line}` }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

const axisStyle = { fontSize: 11, fill: C.mute, fontFamily: FONT_DATA };

function ResultsSection() {
  return (
    <Section id="results" tone="tint">
      <SectionHead
        index="06"
        title="Quantified, sampled, audited"
        lede="Grow Indigo started the season with 419 farmers; procurement completed for 249, and the square-root sampling method selected 16 of them for measurement. GHG quantification ran post-harvest on the Cool Farm Platform V3.0 and was reviewed by a third-party auditor."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal>
          <ChartFrame
            kicker="Chart 1 · Emissions intensity"
            title="Half the carbon in every tonne"
            unit="kg CO₂e per MT of paddy"
            footnote="Two project figures are shown because the report quantifies with and without the nursery stage. The headline 51% uses the corrected nursery emission of 24.54 kg CO₂e/MT."
          >
            <BarChart data={EMISSIONS} margin={{ top: 10, right: 10, left: -12, bottom: 34 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} interval={0} angle={-12} textAnchor="end" height={54} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 1400]} />
              <Tooltip content={<ChartTip unit="kg CO₂e/MT" />} cursor={{ fill: "rgba(14,91,51,.06)" }} />
              <ReferenceLine y={1325} stroke={C.husk} strokeDasharray="4 4" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1200} animationEasing="ease-out">
                {EMISSIONS.map((e) => (
                  <Cell key={e.name} fill={e.fill} />
                ))}
                <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
        </Reveal>

        <Reveal delay={110}>
          <ChartFrame
            kicker="Chart 2 · Nitrogen use"
            title="Less urea, same crop"
            unit="kg nitrogen per acre"
            footnote="Driven primarily by Oorjit granules' fertiliser-use efficiency combined with AWD irrigation, and supported by temporary urea market shortages. Evidence indicates AWD enables a further ~13% nitrogen reduction without compromising performance (P.V.M. et al., 2025)."
          >
            <BarChart data={NITROGEN} margin={{ top: 10, right: 10, left: -12, bottom: 34 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} interval={0} angle={-12} textAnchor="end" height={54} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 70]} />
              <Tooltip content={<ChartTip unit="kg N/acre" />} cursor={{ fill: "rgba(14,91,51,.06)" }} />
              <ReferenceLine y={48} stroke={C.husk} strokeDasharray="4 4" label={{ value: "PJTSAU dose", position: "insideTopRight", style: { fontSize: 10, fill: C.husk, fontFamily: FONT_DATA } }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1200} animationBegin={200}>
                {NITROGEN.map((e) => (
                  <Cell key={e.name} fill={e.fill} />
                ))}
                <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
        </Reveal>

        <Reveal>
          <ChartFrame
            kicker="Supporting indicator"
            title="Water per kilogram of paddy"
            unit="litres per kg"
            height={230}
            footnote="Baseline of ~3,250 litres/kg is stated in the report; the project figure is derived from the ~45% saving reported for AWD adoption."
          >
            <BarChart data={WATER} layout="vertical" margin={{ top: 4, right: 44, left: 96, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 3600]} />
              <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={92} />
              <Tooltip content={<ChartTip unit="litres/kg" />} cursor={{ fill: "rgba(30,136,168,.07)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30} animationDuration={1200}>
                {WATER.map((e) => (
                  <Cell key={e.name} fill={e.fill} />
                ))}
                <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
        </Reveal>

        <Reveal delay={110}>
          <ChartFrame
            kicker="Supporting indicator"
            title="Yield, season on season"
            unit="MT per acre, average"
            height={230}
            footnote="A ~7.4% decline. The report attributes it to seasonal factors - irregular monsoon distribution, untimely rainfall, temporary water stress, high temperatures at flowering or grain filling, cloudy weather and lodging - alongside agronomic variation in transplanting dates, varietal performance, pest pressure, weed competition, nutrient timing and soil fertility."
          >
            <LineChart data={YIELD} margin={{ top: 16, right: 24, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[2, 3]} />
              <Tooltip content={<ChartTip unit="MT" />} />
              <Line
                type="linear"
                dataKey="value"
                stroke={C.husk}
                strokeWidth={2.5}
                dot={{ r: 5, fill: C.husk, strokeWidth: 0 }}
                activeDot={{ r: 7 }}
                animationDuration={1200}
              >
                <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
              </Line>
            </LineChart>
          </ChartFrame>
        </Reveal>
      </div>

      {/* methodology */}
      <div className="grid gap-6 lg:grid-cols-2 mt-12">
        <Reveal>
          <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <Eyebrow>How the nursery stage was handled</Eyebrow>
            <p className="mt-4" style={{ fontSize: 14.5, lineHeight: 1.75, color: C.mute }}>
              Farmers typically raise seedlings on ~10% of their land for ~21 days. With average landholding in the
              project at ~9.1 acres, that is ~0.9 acres per farmer. Methane emissions during cultivation are calculated
              per day, so nursery emissions were estimated over ~0.9 acres × ~21 days, then adjusted by a ~33%
              correction factor because seedlings produce far less biomass than main-field crops.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[["36.80", "gross nursery"], ["24.54", "after correction"], ["679.13", "net reduction"]].map(([v, l]) => (
                <div key={l} className="p-3 rounded" style={{ background: C.paperDim }}>
                  <div className="ch-display" style={{ fontWeight: 800, color: C.field, fontSize: "1.35rem" }}>{v}</div>
                  <div className="ch-data" style={{ fontSize: 9.5, color: C.mute, marginTop: 2 }}>{l} · kg CO₂e/MT</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="p-7 rounded-lg h-full" style={{ background: C.field }}>
            <Eyebrow color={C.husk}>Nitrogen use optimisation</Eyebrow>
            <p className="mt-4" style={{ fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,.85)" }}>
              Application fell from the university-recommended 48 kg N/acre (PJTSAU) to 35.6 kg N/acre - a 26%
              reduction - driven primarily by Oorjit granules' enhanced fertiliser-use efficiency combined with AWD
              irrigation, and further supported by temporary urea market shortages. Against farmers' business-as-usual
              62.4 kg N/acre, the project rate is 43% lower.
            </p>
            <p className="ch-data mt-5 pt-4" style={{ fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,.6)", borderTop: "1px solid rgba(255,255,255,.18)" }}>
              Evidence indicates AWD enables a further ~13% nitrogen reduction without compromising system performance,
              due to improved nitrogen-use efficiency (P.V.M. et al., 2025).
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   13 · THE SEASON - activity timeline + critical stages
   The Gantt bars grow from the left when the block scrolls in; hovering a bar
   surfaces the operational detail behind it.
---------------------------------------------------------------------------- */
const MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const TIMELINE = [
  ["Crop establishment", C.leaf, [
    ["Nursery planting", 1, 1, "Seedlings raised on ~10% of land for ~21 days"],
    ["Transplanting", 2, 1, "Post-emergence herbicide applied within 3 days of transplanting"],
  ]],
  ["Regen interventions", C.water, [
    ["AWD pipe installed", 3, 1, "10–15 days after transplanting, across all project plots"],
    ["AWD monitoring", 3, 3, "Manual water-level measurement guiding every irrigation cycle"],
  ]],
  ["Nutrition", C.field, [
    ["1st split", 3, 1, "~15 DAT · urea + DAP with 6 kg/acre Oorjit and 20 kg Grow Phos"],
    ["2nd split", 5, 1, "~65 DAT · panicle initiation, typically with fungicide and insecticide"],
    ["3rd split", 6, 1, "~75 DAT · supports grain development"],
  ]],
  ["Harvest", C.husk, [["Harvest", 6, 1, "Crop matured through the season, harvest from mid-October onward"]]],
  ["Field monitoring", C.waterDeep, [["Data collection for agronomy, fertiliser & water", 3, 5, "Captured in FieldKhata with geofenced field boundaries"]]],
  ["Farmer engagement", C.clay, [
    ["1st VLM", 3, 1, "Demonstration of AWD pipe installation"],
    ["2nd VLM", 4, 1, "Oorjit and Grow Phos application"],
    ["3rd & 4th VLM", 5, 2, "Residue management and season review"],
  ]],
  ["Procurement & compliance", C.mute, [
    ["Procurement & traceability", 6, 2, "Farm-to-mill audit trail captured in S3 Sutra"],
    ["Audit & report submission", 8, 1, "Independent verification and final delivery"],
  ]],
];

function Timeline() {
  const [ref, inView] = useInView({ threshold: 0.15 });
  const [tip, setTip] = useState(null);
  return (
    <div ref={ref} className="p-5 md:p-7 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <div className="ch-scroll" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          {TIMELINE.map(([label, color, bars], r) => (
            <div key={label} className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <div
                className="ch-data px-3 py-2 rounded"
                style={{ width: 168, flexShrink: 0, fontSize: 10.5, fontWeight: 600, background: color, color: "#fff", lineHeight: 1.35 }}
              >
                {label}
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${MONTHS.length}, 1fr)`, gap: 3 }}>
                {bars.map(([t, start, span, detail]) => (
                  <div
                    key={t}
                    onMouseEnter={() => setTip(`${t} - ${detail}`)}
                    onMouseLeave={() => setTip(null)}
                    className="ch-data px-2 py-2 rounded"
                    style={{
                      gridColumn: `${start} / span ${span}`,
                      background: color,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "help",
                      transformOrigin: "left center",
                      transform: inView ? "scaleX(1)" : "scaleX(0)",
                      opacity: inView ? 1 : 0,
                      transition: `transform .7s cubic-bezier(.22,.61,.36,1) ${r * 90}ms, opacity .4s ease ${r * 90}ms, filter .2s ease`,
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
                    onMouseOut={(e) => (e.currentTarget.style.filter = "none")}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-3" style={{ marginTop: 10 }}>
            <div style={{ width: 168, flexShrink: 0 }} />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${MONTHS.length}, 1fr)`, gap: 3 }}>
              {MONTHS.map((m) => (
                <div key={m} className="ch-data text-center" style={{ fontSize: 11, color: C.mute, fontWeight: 600 }}>
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="ch-data mt-4 pt-3" style={{ fontSize: 11, color: tip ? C.field : C.mute, borderTop: `1px solid ${C.line}`, minHeight: 34, lineHeight: 1.6 }}>
        {tip || "HOVER ANY BAR FOR THE OPERATIONAL DETAIL"}
      </div>
    </div>
  );
}

const STAGES = [
  ["Tillering", "For effective tiller production", "Reduction in effective tillers leads to yield loss"],
  ["Panicle to flowering", "For fertile grain formation", "More sterile grains - yield loss"],
  ["Milking to dough", "For complete grain filling", "Less head rice, more broken rice"],
];

function SeasonSection() {
  return (
    <Section id="season">
      <SectionHead
        index="07"
        title="A season, operation by operation"
        lede="The rice production cycle ran from nursery establishment through transplanting to harvest, with a structured sequence of agronomic operations, regenerative interventions and nutrient applications timed to crop stage."
      />
      <Reveal>
        <Timeline />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2 mt-10">
        <Reveal>
          <div className="space-y-4" style={{ fontSize: 14.5, lineHeight: 1.75, color: C.mute }}>
            <p>
              Seedlings were transplanted mid-season and, within the first three days, farmers applied a
              post-emergence herbicide - Bispyribac Sodium 10SC, or Fenoxaprop-p-ethyl 6.7EC + Metsulfuron Methyl 10WP
              + Chlorimuron Ethyl 10WP - for early weed suppression. Between 10–15 days after transplanting, AWD field
              pipes were installed across all project plots and manual water-level measurement began.
            </p>
            <p>
              At ~15 DAT (tillering), farmers applied the first split of urea and DAP alongside 6 kg/acre of Oorjit
              granules and 20 kg of Grow Phos, with support from Grow Indigo's field team. Around ~55 DAT a second
              herbicide went on where weed pressure required it. The second urea split followed at ~65 DAT (panicle
              initiation), typically with fungicide and insecticide; the third and final split at ~75 DAT supported
              grain development.
            </p>
            <p>
              Post-harvest activity began at crop maturity. Procurement and traceability documentation were completed
              soon after harvest, with GHG quantification and report submission following.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
            <div className="px-6 py-4" style={{ background: C.field }}>
              <Eyebrow color="rgba(255,255,255,.7)">Critical crop stages for AWD management</Eyebrow>
            </div>
            {STAGES.map(([stage, why, risk], i) => (
              <div key={stage} className="px-6 py-5" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <div style={{ fontWeight: 600, color: C.field, fontSize: 15 }}>{stage}</div>
                <div className="mt-1.5" style={{ fontSize: 13.5, color: C.ink }}>{why}</div>
                <div className="ch-data mt-2 flex gap-2" style={{ fontSize: 11, color: C.clay, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600 }}>RISK IF MISSED</span>
                  <span style={{ color: C.mute }}>{risk}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   14 · ECONOMICS FOR FARMERS
---------------------------------------------------------------------------- */
const SHORT_TERM = [
  ["Fertiliser cost optimisation", "Oorjit Granules and Grow Phos improved nutrient uptake and reduced reliance on synthetic fertilisers. Supplied free of cost, so farmers saw no added expense and a ~26% reduction per acre in nitrogen fertiliser."],
  ["No investment for AWD infrastructure", "AWD pipes were supplied, removing upfront cost and enabling immediate adoption."],
  ["Reduced irrigation & energy costs", "Lower irrigation frequency cut electricity and diesel for pumping - direct savings on power and fuel."],
  ["Residue monetisation", "CRM support let farmers sell paddy straw to local gaushalas - additional income while avoiding residue-management costs."],
];
const LONG_TERM = [
  ["Improved soil organic carbon", "Repeated use of biological inputs and AWD raises SOC over time, improving nutrient retention and supporting stable, improved yields."],
  ["Reduced production risk", "Regenerative practices strengthen resilience to water stress, erratic rainfall and pest pressure, helping farmers manage climate and market risk."],
  ["Stronger market access", "Traceable, low-emission rice opens premium procurement linkages with sustainability-focused buyers like ABC."],
  ["Community capacity built", "Knowledge of climate-smart practices stays with farmers, multiplying the benefit across seasons and neighbours."],
];

function EconomicsSection() {
  const col = (title, items, accent, delay) => (
    <Reveal delay={delay}>
      <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: `3px solid ${accent}` }}>
        <Eyebrow color={accent}>{title}</Eyebrow>
        <div className="mt-6 space-y-5">
          {items.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span style={{ color: accent, fontWeight: 700, lineHeight: 1.5 }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink }}>{k}</div>
                <div className="mt-1" style={{ fontSize: 13.5, lineHeight: 1.65, color: C.mute }}>{v}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
  return (
    <Section id="economics" tone="tint">
      <SectionHead
        index="08"
        title="What it meant for the farmer"
        lede="The project strengthened farm economics through immediate cost savings and longer-term productivity gains from regenerative practice."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {col("Short-term impact", SHORT_TERM, C.husk, 0)}
        {col("Long-term impact", LONG_TERM, C.field, 110)}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   15 · ALIGNMENT WITH ABC RESPONSIBLE SOURCING
   Four project levers, four pillars. Hovering a lever holds its pillar and
   dims the rest, so the mapping is read rather than asserted.
---------------------------------------------------------------------------- */
const LEVERS = [
  ["Alternate Wetting & Drying", "~45% water savings · CH₄ reduction", 0],
  ["Oorjit, Grow Phos + CRM", "26% N reduction · no field burning", 2],
  ["FieldKhata + S3 Sutra", "End-to-end digital audit trail", 3],
  ["Farmer capacity building", "VLMs, KA support, vernacular training", 1],
];
const PILLARS = [
  ["Pillar 01", "Climate Action & Net Zero", "AWD reduces methane formation at source; optimised nitrogen lowers N₂O. A direct, verifiable Scope 3 insetting contribution.", C.field],
  ["Pillar 02", "Water Stewardship & Livelihoods", "~45% water savings free up aquifer capacity; pumping and fertiliser cuts plus straw monetisation lift farm-gate margins.", C.water],
  ["Pillar 03", "Land, Forests & Biodiversity", "Oorjit and Grow Phos improve SOC and soil biology; CRM ends open field burning, protecting soil biota and air quality.", C.leaf],
  ["Pillar 04", "Traceability & Human Rights", "FieldKhata and S3 Sutra build a geo-tagged, audit-ready record; the engagement model preserves voluntary participation.", C.husk],
];

function SourcingSection() {
  const [active, setActive] = useState(null);
  return (
    <Section id="sourcing" tone="dark">
      <SectionHead
        index="09"
        tone="dark"
        title="Mapped to ABC's Responsible Sourcing Standard"
        lede="ABC's standard sets out how the company expects its agricultural supply chain to operate - environmental performance, human-rights protection, traceability and farmer livelihoods. Every intervention deployed in Nizamabad maps onto a pillar, and every metric here supports ABC's Scope 3 and ESG disclosure obligations."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Eyebrow color="rgba(255,255,255,.5)">Project levers</Eyebrow>
          <div className="mt-4 space-y-3">
            {LEVERS.map(([name, sub, target], i) => {
              const on = active === i;
              return (
                <div
                  key={name}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="p-5 rounded"
                  style={{
                    background: on ? "#fff" : "rgba(255,255,255,.06)",
                    border: `1px solid ${on ? "#fff" : "rgba(255,255,255,.14)"}`,
                    cursor: "pointer",
                    opacity: active === null || on ? 1 : 0.4,
                    transform: on ? "translateX(6px)" : "none",
                    transition: "all .3s cubic-bezier(.22,.61,.36,1)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, color: on ? C.ink : "#fff" }}>{name}</div>
                  <div className="ch-data mt-1" style={{ fontSize: 11, color: on ? C.mute : "rgba(255,255,255,.55)" }}>
                    {sub}
                  </div>
                  <div className="ch-data mt-2" style={{ fontSize: 10, color: PILLARS[target][3], letterSpacing: ".1em" }}>
                    → {PILLARS[target][0].toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={110}>
          <Eyebrow color="rgba(255,255,255,.5)">Responsible sourcing pillars</Eyebrow>
          <div className="mt-4 space-y-3">
            {PILLARS.map(([code, name, contribution, color], i) => {
              const linked = active !== null && LEVERS[active][2] === i;
              return (
                <div
                  key={code}
                  className="p-5 rounded"
                  style={{
                    background: linked ? color : "rgba(255,255,255,.06)",
                    border: `1px solid ${linked ? color : "rgba(255,255,255,.14)"}`,
                    opacity: active === null || linked ? 1 : 0.35,
                    transition: "all .3s cubic-bezier(.22,.61,.36,1)",
                  }}
                >
                  <div className="ch-data" style={{ fontSize: 10, letterSpacing: ".14em", color: linked ? "rgba(255,255,255,.85)" : color, fontWeight: 600 }}>
                    {code.toUpperCase()}
                  </div>
                  <div className="mt-1" style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>{name}</div>
                  <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.65, color: linked ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.55)" }}>
                    {contribution}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>

      <Reveal delay={120} className="mt-10">
        <div className="p-7 md:p-9 rounded-lg" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)" }}>
          <Eyebrow color={C.husk}>Insight</Eyebrow>
          <div className="mt-5 grid gap-6 md:grid-cols-3" style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,.75)" }}>
            <p>
              AWD alone delivers eight distinct ESG benefits. That breadth lets ABC communicate the work credibly
              across climate, water, biodiversity and rural-development pillars - without overstating any single claim,
              and while staying inside the bounds of the field evidence.
            </p>
            <p>
              Geo-tagged field boundaries, farmer-diary practice records, scientific QC and Cool Farm Platform
              quantification together produce emission reductions that are field-attributable and third-party
              verifiable - the quality threshold for Scope 3 insetting claims under emerging GHG Protocol and SBTi
              guidance.
            </p>
            <p>
              The programme is a working template for how ABC's Responsible Sourcing commitments translate into
              measurable, defensible field outcomes - providing both the operational learnings and the disclosure
              evidence needed to scale climate-aligned procurement across the rice category, and beyond.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   16 · FIELD EVIDENCE (Annexures 1–10)
   Each annexure keeps the GPS Map Camera stamp from the source photograph.
   Drop a real image in via the `src` field and it replaces the drawn scene.
---------------------------------------------------------------------------- */
const EVIDENCE = [
  { n: 1, title: "Village-level meetings with farmers", scene: "meeting", place: "Kunipoor, Telangana, India", coords: "18.511113°N 77.940613°E", when: "Tue, 16/12/2025 10:27 AM GMT +05:30", caption: "Farmers attending a VLM with the field team - four VLMs were held across the project period." },
  { n: 2, title: "Stakeholder feedback form", scene: "form", place: "Ghanpur, Telangana, India", coords: "Signed at village level", when: "22-01-26", caption: "Bilingual Telugu/English feedback form. Respondent rated the programme in the top band and noted Grow Phos and Oorjit performed well." },
  { n: 3, title: "Farmer diary", scene: "form", place: "Ghanpur, Telangana, India", coords: "Farmer ID 1f22356e", when: "Rabi 2026", caption: "Socio-economic profile plus a dated water-management log: irrigation date, method, source and re-irrigation frequency for every event." },
  { n: 4, title: "Feedback form (second respondent)", scene: "form", place: "Ghanpur, Telangana, India", coords: "Stakeholder feedback", when: "22-01-26", caption: "Second signed stakeholder feedback record retained in the audit pack." },
  { n: 5, title: "ABC team field visits", scene: "team", place: "Srinagar, Nizamabad, Telangana", coords: "18.537088°N 77.925309°E", when: "Mon, 25/05/2026 10:43 AM GMT +05:30", caption: "ABC representatives in-field with the Grow Indigo team and participating farmers." },
  { n: 6, title: "AWD pipes during monitoring", scene: "pipe", place: "Ghanpur, Telangana, India", coords: "18.573399°N 77.927099°E", when: "Thu, 05/02/2026 12:00 PM GMT +05:30", caption: "Perforated field tube with the measuring scale in place - water depth read directly against the gauge." },
  { n: 7, title: "Harvest in action", scene: "harvest", place: "Bhavanipet, Telangana, India", coords: "18.580134°N 77.925124°E", when: "Mon, 23/03/2026 09:33 AM GMT +05:30", caption: "Combine harvesting a project plot in the Bodhan–Chandur road cluster." },
  { n: 8, title: "Baled crop residue, geo-tagged", scene: "bales", place: "Ghanpur, Telangana, India", coords: "18.569495°N 77.937344°E", when: "Tue, 19/05/2026 10:49 AM GMT +05:30", caption: "Straw baled and stacked instead of burnt - 600 acres against a 300-acre target." },
  { n: 9, title: "Grains ready to be transported", scene: "grain", place: "Nizamabad, Telangana, India", coords: "18.522364°N 77.868633°E", when: "Mon, 20/04/2026 07:16 AM GMT +05:30", caption: "Procurement staging at Pedda Kalava Katta ahead of movement to the empanelled miller." },
  { n: 10, title: "Procurement form and receipt", scene: "form", place: "Varni, Nizamabad", coords: "Vehicle AP29TB1278 · Paddy 36,750 kg net", when: "12-04-2026", caption: "Weighbridge slip, Form of Certificate (X) countersigned by the village officer, and the miller's payment voucher - the closing links in the farm-to-mill chain." },
];

/** Small drawn scenes stand in for the source photographs. Swap `src` in and
 *  render an <img> here instead - the geotag bar is designed to sit over it. */
function EvidenceScene({ kind }) {
  const base = { width: "100%", height: 168, display: "block" };
  const scenes = {
    meeting: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#123B2A" />
        <rect y="110" width="320" height="58" fill="#0C2A1E" />
        {Array.from({ length: 16 }).map((_, i) => (
          <g key={i}>
            <circle cx={30 + (i % 8) * 36} cy={112 + Math.floor(i / 8) * 26} r="8" fill={i % 3 ? "#2E6B4C" : "#3C7F5A"} />
            <rect x={22 + (i % 8) * 36} y={122 + Math.floor(i / 8) * 26} width="16" height="18" rx="4" fill={i % 2 ? "#245A40" : "#2E6B4C"} />
          </g>
        ))}
        <rect x="120" y="34" width="90" height="52" rx="3" fill="#EEF3EC" opacity=".9" />
        <circle cx="76" cy="66" r="11" fill={C.husk} />
        <rect x="66" y="78" width="20" height="26" rx="5" fill={C.husk} opacity=".8" />
      </svg>
    ),
    pipe: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#16452F" />
        {Array.from({ length: 22 }).map((_, i) => (
          <path key={i} d={`M${8 + i * 15} 168 q6 -60 2 -92`} stroke={C.leaf} strokeWidth="2" fill="none" opacity=".55" />
        ))}
        <ellipse cx="160" cy="104" rx="58" ry="26" fill="#E8EDE6" />
        <ellipse cx="160" cy="104" rx="44" ry="18" fill="#2E4A3C" />
        <rect x="150" y="34" width="20" height="76" rx="3" fill="#fff" opacity=".92" />
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1="152" y1={44 + i * 9} x2="162" y2={44 + i * 9} stroke={C.mute} strokeWidth="1" />
        ))}
        <rect x="150" y="88" width="20" height="22" fill={C.water} opacity=".7" />
      </svg>
    ),
    bales: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#D9C089" />
        <rect y="128" width="320" height="40" fill="#C7AC76" />
        {[[30, 96], [86, 96], [142, 96], [58, 62], [114, 62], [86, 28]].map(([x, y], i) => (
          <g key={i}>
            <rect x={x} y={y} width="52" height="32" rx="3" fill="#E3CF9C" stroke="#B79B64" />
            <line x1={x + 14} y1={y} x2={x + 14} y2={y + 32} stroke="#B79B64" />
            <line x1={x + 36} y1={y} x2={x + 36} y2={y + 32} stroke="#B79B64" />
          </g>
        ))}
        <rect x="228" y="60" width="60" height="72" rx="4" fill="#5B8FB0" opacity=".6" />
      </svg>
    ),
    harvest: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#CBB55E" />
        <rect y="0" width="320" height="52" fill="#9FBBA0" />
        {Array.from({ length: 40 }).map((_, i) => (
          <path key={i} d={`M${4 + i * 8} 168 q3 -30 0 -46`} stroke="#B79A3E" strokeWidth="2" fill="none" opacity=".7" />
        ))}
        <rect x="180" y="40" width="76" height="34" rx="4" fill="#B0483C" />
        <rect x="248" y="50" width="26" height="24" rx="3" fill="#8E3A31" />
        <circle cx="200" cy="78" r="9" fill="#3A3A3A" />
        <circle cx="240" cy="78" r="9" fill="#3A3A3A" />
      </svg>
    ),
    grain: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#B99A6B" />
        <rect y="112" width="320" height="56" fill="#A98A5D" />
        <path d="M100 132 q60 -74 120 0 z" fill="#E0C98F" />
        <path d="M40 136 q34 -40 68 0 z" fill="#D8BE80" />
        {[[24, 108], [46, 108], [268, 106], [288, 106]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="18" height="30" rx="3" fill="#8E7448" />
        ))}
      </svg>
    ),
    team: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#8FA98A" />
        <rect y="96" width="320" height="72" fill="#7A6B4F" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <circle cx={38 + i * 50} cy="66" r="12" fill="#E8D5B5" />
            <rect x={26 + i * 50} y="82" width="24" height="46" rx="7" fill={[C.field, "#2E6B4C", "#E8EDE6", "#1E88A8", C.field, "#E8EDE6"][i]} />
          </g>
        ))}
      </svg>
    ),
    form: (
      <svg viewBox="0 0 320 168" style={base}>
        <rect width="320" height="168" fill="#E9E6DC" />
        <rect x="34" y="14" width="252" height="140" fill="#FBFAF6" stroke="#CFC9B8" />
        <rect x="52" y="30" width="120" height="8" rx="2" fill={C.field} opacity=".7" />
        <rect x="52" y="48" width="80" height="5" rx="2" fill="#B9B3A2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <rect key={i} x="52" y={68 + i * 12} width={i % 3 === 0 ? 200 : 152} height="4" rx="2" fill="#D5CFC0" />
        ))}
        <rect x="196" y="118" width="60" height="22" rx="2" fill="none" stroke="#B9B3A2" />
        <path d="M204 134 q12 -14 24 -4 t18 -6" stroke={C.ink} strokeWidth="1.4" fill="none" />
      </svg>
    ),
  };
  return scenes[kind] || scenes.form;
}

function EvidenceSection() {
  return (
    <Section id="evidence">
      <SectionHead
        index="10"
        title="Field evidence"
        lede="The annexures below document field-level evidence, monitoring data and operational records collected throughout the project period - each one geo-tagged and dated at the point of capture."
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EVIDENCE.map((e, i) => (
          <Reveal key={e.n} delay={(i % 3) * 90}>
            <div
              className="rounded-lg overflow-hidden h-full"
              style={{ background: "#fff", border: `1px solid ${C.line}`, transition: "transform .35s ease, box-shadow .35s ease" }}
              onMouseEnter={(ev) => {
                ev.currentTarget.style.transform = "translateY(-4px)";
                ev.currentTarget.style.boxShadow = "0 18px 40px -26px rgba(10,31,22,.5)";
              }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.transform = "none";
                ev.currentTarget.style.boxShadow = "none";
              }}
            >
              <div className="relative">
                <EvidenceScene kind={e.scene} />
                {/* GPS Map Camera stamp, as burned into the source photographs */}
                <div className="absolute left-0 right-0 bottom-0 px-3 py-2" style={{ background: "linear-gradient(transparent, rgba(0,0,0,.78))" }}>
                  <GeoStamp place={e.place} coords={e.coords} when={e.when} />
                </div>
              </div>
              <div className="p-5">
                <Eyebrow>Annexure {e.n}</Eyebrow>
                <div className="mt-2" style={{ fontWeight: 600, fontSize: 15, color: C.field }}>{e.title}</div>
                <p className="mt-2" style={{ fontSize: 13, lineHeight: 1.65, color: C.mute }}>{e.caption}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={100} className="mt-6">
        <div className="ch-data p-4 rounded" style={{ fontSize: 11, color: C.mute, background: C.paperDim, lineHeight: 1.7 }}>
          Scenes above are drawn placeholders holding the layout for the source photographs. Replace{" "}
          <span style={{ color: C.field, fontWeight: 600 }}>&lt;EvidenceScene /&gt;</span> with an{" "}
          <span style={{ color: C.field, fontWeight: 600 }}>&lt;img&gt;</span> - the geotag bar is already positioned to
          sit over it.
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   17 · BIBLIOGRAPHY, DATA NOTES, CONFIDENTIALITY
---------------------------------------------------------------------------- */
const BIBLIOGRAPHY = [
  ["Alternate Wetting & Drying: Climate Smart Water Management Practice in Rice", "PJTSAU", "https://www.pjtau.edu.in/files/publications/2018/AWDBroucher.pdf"],
  ["Ma et al. (2012). Greenhouse gas emissions during the rice seedling stage as affected by cultivar type and crop density.", "ResearchGate", "https://www.researchgate.net/publication/230563682"],
  ["Megha, P. V., Salimath, S. B., Biradar, G. S., Kuri, S., & Anjali, M. C. (2025). Farmer's response under conventional system and alternate wetting and drying method of paddy cultivation in Karnataka. International Journal of Research in Agronomy, 8(10S), 275–278.", "DOI", "https://doi.org/10.33545/2618060X.2025.v8.i10Sd.4098"],
  ["Professor Jayashankar Telangana State Agricultural University. (2017–18). Rice [PDF].", "PJTSAU", "https://www.pjtau.edu.in/pdf2/rice.pdf"],
  ["Patel Vedant, C., & Vekariya, P. B. (2018). Performance evaluation of pressure head loads and pumping efficiency on electrical pump sets. Indian Journal of Agricultural Research, 52(4), 374–379.", "DOI", "https://doi.org/10.18805/IJARe.A-501"],
];

const DATA_NOTES = [
  "Headline GHG reduction of 679.13 kg CO₂e/MT (51%) is measured against ABC's baseline of 1,325 kg CO₂e/MT and includes the corrected nursery emission of 24.54 kg CO₂e/MT.",
  "The report also states 703.68 kg CO₂e/MT (~53%) excluding nursery emissions and 666.87 kg CO₂e/MT (~50%) using gross nursery emissions - all three are shown in Chart 1 rather than collapsed into one number.",
  "Water use of ~1,788 litres/kg is derived from the ~45% saving reported against the stated ~3,250 litres/kg baseline; the source document leaves this cell blank.",
  "Farmer counts differ by stage: 300 farmers in the executive summary, 419 enrolled and 249 completing procurement in the quantification section, of whom 16 were sampled.",
];

function Closing() {
  return (
    <footer style={{ background: C.ink }}>
      <div className="mx-auto px-5 md:px-10 py-20 md:py-24" style={{ maxWidth: 1180 }}>
        <div className="grid gap-10 lg:grid-cols-2">
          <Reveal>
            <Eyebrow color={C.husk}>Bibliography</Eyebrow>
            <ol className="mt-5 space-y-4">
              {BIBLIOGRAPHY.map(([cite, label, href], i) => (
                <li key={href} className="flex gap-4">
                  <span className="ch-data" style={{ color: C.husk, fontSize: 11, fontWeight: 600, paddingTop: 3 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.78)" }}>{cite}</div>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="ch-data"
                      style={{ fontSize: 10.5, color: C.leaf, letterSpacing: ".08em" }}
                    >
                      {label.toUpperCase()} ↗
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={110}>
            <Eyebrow color={C.husk}>How to read the numbers</Eyebrow>
            <ul className="mt-5 space-y-3">
              {DATA_NOTES.map((n) => (
                <li key={n} className="flex gap-3" style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(255,255,255,.7)" }}>
                  <span style={{ color: C.water }}>▸</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 p-6 rounded-lg" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)" }}>
              <Eyebrow color={C.husk}>Confidentiality</Eyebrow>
              <p className="mt-3" style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,.72)", fontStyle: "italic" }}>
                The information provided herein and any files attached to it are confidential and intended solely for
                ABC's use. It is shared exclusively for the purpose of ABC internal use and must not be used, disclosed
                or shared with any other third party without Grow Indigo's prior written consent.
              </p>
            </div>
          </Reveal>
        </div>

        <div
          className="mt-16 pt-8 flex flex-wrap gap-4 items-center justify-between"
          style={{ borderTop: "1px solid rgba(255,255,255,.15)" }}
        >
          <div className="ch-display" style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>
            grow<span style={{ color: C.leaf }}>indigo</span>
            <span style={{ color: "rgba(255,255,255,.3)", margin: "0 10px" }}>/</span>
            clear<span style={{ color: C.husk }}>harvest</span>
          </div>
          <div className="ch-data" style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)", letterSpacing: ".1em" }}>
            GROW INDIGO PVT. LTD. · PRIVATE &amp; CONFIDENTIAL · NOV 2026 – APR 2026
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------------------------
   18 · ROOT
---------------------------------------------------------------------------- */
export default function ClearHarvestReport() {
  const progress = useScrollProgress();
  return (
    <div className="ch-root" style={{ scrollBehavior: "smooth" }}>
      <GlobalStyle />
      <TopBar progress={progress} />
      <AwdGauge progress={progress} />

      <main>
        <Hero />
        <ImpactStrip />
        <LocationSection />
        <InterventionsSection />
        <GovernanceSection />
        <BenefitsSection />
        <ResultsSection />
        <SeasonSection />
        <EconomicsSection />
        <SourcingSection />
        <EvidenceSection />
      </main>

      <Closing />
    </div>
  );
}