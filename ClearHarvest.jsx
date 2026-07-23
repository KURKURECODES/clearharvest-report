/* ============================================================================
   ClearHarvest - Low-Emission Rice Offtake · Interactive Project Report
   Grow Indigo  |  Nizamabad, Telangana  |  Rabi 2026
   ----------------------------------------------------------------------------
   ANIMATION STACK
     gsap + ScrollTrigger  → orchestrated timelines, scrubbed parallax, pinned
                             statement, batched grid reveals, counters, the
                             scroll-driven AWD water gauge
     framer-motion         → layout transitions (layoutId / AnimatePresence),
                             micro-interactions (whileHover / whileTap), spring
                             cursor tracking, staggered variant trees

   INSTALL
     npm i framer-motion gsap recharts
     (Tailwind assumed present. GSAP ScrollTrigger ships in the free package.)

   PERFORMANCE / CRAFT NOTES
     · Every GSAP call lives inside gsap.context() scoped to a ref and is
       reverted on unmount - no orphaned ScrollTriggers on route change.
     · gsap.matchMedia() gates pinning and heavy parallax to desktop and kills
       all motion under prefers-reduced-motion.
     · Only transform and opacity are animated on scroll; nothing triggers
       layout. will-change is applied narrowly, on scrubbed elements only.
   ========================================================================== */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  LayoutGroup,
} from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from "recharts";

gsap.registerPlugin(ScrollTrigger);

/* ----------------------------------------------------------------------------
   1 · DESIGN TOKENS
   Palette drawn from the field itself: flooded-paddy water, wet silt, husk,
   young leaf. Tailwind handles layout; brand colour lives in style objects.
---------------------------------------------------------------------------- */
const C = {
  ink: "#0A1F16",
  inkSoft: "#12291F",
  field: "#0E5B33",
  leaf: "#4FA65B",
  water: "#1E88A8",
  waterDeep: "#12566B",
  husk: "#C98A2E",
  clay: "#8C5A3C",
  paper: "#EEF3EC",
  paperDim: "#DFE8DD",
  line: "#C3D3C1",
  mute: "#5C7264",
};

const FONT_DISPLAY = "'Bricolage Grotesque', 'Archivo', system-ui, sans-serif";
const FONT_BODY = "'Inter Tight', 'Inter', system-ui, sans-serif";
const FONT_DATA = "'IBM Plex Mono', ui-monospace, monospace";

/** Framer's shared easing curve - one curve across the whole site keeps the
 *  motion language coherent no matter which library is driving it. */
const EASE = [0.22, 0.61, 0.36, 1];
const GSAP_EASE = "power3.out";

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Inter+Tight:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      .ch-root { font-family: ${FONT_BODY}; background: ${C.paper}; color: ${C.ink};
        overflow-x: hidden; }
      .ch-display { font-family: ${FONT_DISPLAY}; letter-spacing: -0.03em; line-height: 0.98; }
      .ch-data { font-family: ${FONT_DATA}; font-variant-numeric: tabular-nums; }

      /* masked line reveal used by the display type */
      .ch-mask { display: block; overflow: hidden; }
      .ch-scrub { will-change: transform; }

      .ch-ripple { animation: chRipple 4.5s ease-in-out infinite; transform-origin: center; }
      @keyframes chRipple { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(.82) } }

      .ch-root ::selection { background: ${C.husk}; color: #fff; }
      .ch-root :focus-visible { outline: 2px solid ${C.water}; outline-offset: 3px; border-radius: 2px; }
      .ch-scroll::-webkit-scrollbar { height: 6px; }
      .ch-scroll::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 99px; }

      .ch-grain { position: fixed; inset: 0; pointer-events: none; z-index: 60; opacity: .035;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }

      @media (prefers-reduced-motion: reduce) {
        .ch-ripple { animation: none !important; }
      }
    `}</style>
  );
}

/* ----------------------------------------------------------------------------
   2 · MOTION SYSTEM
   Two libraries, one job each:
     framer-motion  – anything the user provokes (hover, tap, layout change)
     gsap           – anything the scrollbar provokes (timelines, scrub, pin)
---------------------------------------------------------------------------- */

/** All GSAP work runs through this. gsap.context() scopes selectors to the
 *  wrapper ref and reverts every tween + ScrollTrigger it created on unmount. */
function useGsapContext(setup, deps = []) {
  const scope = useRef(null);
  useLayoutEffect(() => {
    if (!scope.current) return;
    const ctx = gsap.context((self) => setup(self, scope.current), scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scope;
}

/* ---- framer variant vocabulary ---------------------------------------- */
const vFadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};
const vFadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.9, ease: EASE } },
};
const vScaleIn = {
  hidden: { opacity: 0, scale: 0.94, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const vStagger = (stagger = 0.09, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Standard scroll-in wrapper. `once` keeps the page calm on scroll-back. */
function Reveal({ children, delay = 0, variants = vFadeUp, amount = 0.25, className = "", style, ...rest }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Parent that staggers any <Reveal>/motion children beneath it. */
function Stagger({ children, stagger = 0.09, delay = 0, className = "", amount = 0.2, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={vStagger(stagger, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

/** Display type reveal: each word rides up out of its own clipping mask.
 *  Used only on section headlines - restraint is what keeps it premium. */
function MaskedHeading({ text, className = "", style, delay = 0, as: Tag = "h2" }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const MotionTag = motion[Tag] || motion.h2;
  return (
    <MotionTag
      className={className}
      style={style}
      variants={vStagger(0.055, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="ch-mask" style={{ display: "inline-block", verticalAlign: "bottom" }}>
          <motion.span
            style={{ display: "inline-block" }}
            variants={{
              hidden: reduce ? { opacity: 0 } : { y: "108%", opacity: 0, rotate: 2 },
              show: { y: "0%", opacity: 1, rotate: 0, transition: { duration: 0.8, ease: EASE } },
            }}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/** GSAP scrub parallax. speed is a yPercent delta across the viewport pass. */
function Parallax({ children, speed = -12, className = "", style }) {
  const scope = useGsapContext((self, el) => {
    const target = el.firstElementChild;
    if (!target) return;
    gsap.matchMedia().add(
      { desktop: "(min-width: 900px) and (prefers-reduced-motion: no-preference)" },
      () => {
        gsap.fromTo(
          target,
          { yPercent: -speed / 2 },
          {
            yPercent: speed / 2,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
          }
        );
      }
    );
  }, [speed]);
  return (
    <div ref={scope} className={className} style={style}>
      <div className="ch-scrub">{children}</div>
    </div>
  );
}

/** GSAP-driven counter. Ticks once, snapped, with an easing that decelerates
 *  into the final value rather than stopping dead. */
function Counter({ value, decimals = 0, duration = 1.8, className = "", style, prefix = "", suffix = "" }) {
  const ref = useRef(null);
  useGsapContext(() => {
    const node = ref.current;
    if (!node) return;
    const obj = { v: 0 };
    const fmt = (n) =>
      decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN");
    node.textContent = `${prefix}0${suffix}`;
    gsap.to(obj, {
      v: value,
      duration,
      ease: "power2.out",
      snap: decimals ? { v: 1 / Math.pow(10, decimals) } : { v: 1 },
      onUpdate: () => { node.textContent = `${prefix}${fmt(obj.v)}${suffix}`; },
      scrollTrigger: { trigger: node, start: "top 88%", once: true },
    });
  }, [value]);
  return <span ref={ref} className={className} style={style} />;
}

/** Magnetic pointer attraction - springs, so it settles instead of snapping. */
function Magnetic({ children, strength = 0.35, className = "", style, ...rest }) {
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 220, damping: 18, mass: 0.4 });
  const onMove = useCallback(
    (e) => {
      const r = ref.current.getBoundingClientRect();
      mx.set((e.clientX - (r.left + r.width / 2)) * strength);
      my.set((e.clientY - (r.top + r.height / 2)) * strength);
    },
    [mx, my, strength]
  );
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x, y, ...style }}
      onMouseMove={onMove}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** ScrollTrigger.batch - grids animate in rows as they cross, which reads far
 *  better than every card firing on its own trigger. */
function useBatchReveal(selector, opts = {}) {
  return useGsapContext((self, el) => {
    const items = gsap.utils.toArray(selector, el);
    if (!items.length) return;
    gsap.set(items, { opacity: 0, y: 34 });
    ScrollTrigger.batch(items, {
      start: "top 88%",
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: GSAP_EASE,
          stagger: opts.stagger ?? 0.08,
          overwrite: true,
        }),
    });
  }, []);
}

/* ---- shared chrome ----------------------------------------------------- */
function Eyebrow({ children, color = C.husk, className = "" }) {
  return (
    <div className={`ch-data text-xs uppercase ${className}`} style={{ color, letterSpacing: "0.18em", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function SectionHead({ index, title, lede, tone = "light" }) {
  const fg = tone === "dark" ? "#fff" : C.field;
  const body = tone === "dark" ? "rgba(255,255,255,.72)" : C.mute;
  const rule = tone === "dark" ? "rgba(255,255,255,.18)" : C.line;
  return (
    <div className="mb-10 md:mb-14">
      <Stagger stagger={0.1}>
        <motion.div variants={vFadeIn} className="flex items-baseline gap-4">
          <span className="ch-data text-sm" style={{ color: C.husk, fontWeight: 600 }}>{index}</span>
          {/* the rule draws itself in - a small, cheap signal of intent */}
          <motion.span
            style={{ height: 1, background: rule, transformOrigin: "left center", flex: 1 }}
            variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 1, ease: EASE } } }}
          />
        </motion.div>
      </Stagger>
      <MaskedHeading
        text={title}
        className="ch-display mt-4 text-3xl md:text-5xl"
        style={{ color: fg, fontWeight: 800, maxWidth: "22ch" }}
        delay={0.1}
      />
      {lede && (
        <Reveal delay={0.18}>
          <p className="mt-5 text-base md:text-lg" style={{ color: body, maxWidth: "62ch", lineHeight: 1.65 }}>{lede}</p>
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
      <div className="mx-auto" style={{ maxWidth: 1180 }}>{children}</div>
    </section>
  );
}

function GeoStamp({ place, coords, when }) {
  return (
    <div className="ch-data" style={{ fontSize: 10.5, lineHeight: 1.5, color: "rgba(255,255,255,.9)" }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{place}</div>
      <div style={{ opacity: 0.8 }}>{coords}</div>
      <div style={{ opacity: 0.8 }}>{when}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   3 · SIGNATURE - the AWD field tube
   The programme turns on one object: a perforated pipe sunk into the paddy,
   read by hand. Here it becomes the scroll indicator, driven by a scrubbed
   ScrollTrigger rather than a scroll listener, so it stays glued to the
   scrollbar on momentum devices.
---------------------------------------------------------------------------- */
function AwdGauge() {
  const water = useRef(null);
  const crest = useRef(null);
  const label = useRef(null);
  const shell = useRef(null);

  const scope = useGsapContext((self, el) => {
    const TOP = 10, H = 168, BOTTOM = TOP + H;

    gsap.matchMedia().add(
      { ok: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)" },
      () => {
        // entrance: the tube slides in once the reader is past the hero
        gsap.fromTo(
          el,
          { autoAlpha: 0, x: 30 },
          {
            autoAlpha: 1, x: 0, duration: 0.9, ease: GSAP_EASE,
            scrollTrigger: { trigger: document.body, start: "top+=520 top", toggleActions: "play none none reverse" },
          }
        );

        // wetting–drying: three full cycles across the document, never fully dry
        ScrollTrigger.create({
          trigger: document.body,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
          onUpdate: (st) => {
            const cycle = (Math.sin(st.progress * Math.PI * 6 - Math.PI / 2) + 1) / 2;
            const level = 0.18 + cycle * 0.62;
            const h = H * level;
            gsap.set(water.current, { attr: { y: BOTTOM - h, height: h } });
            gsap.set(crest.current, { attr: { y: BOTTOM - h - 3 } });
            if (label.current) label.current.textContent = `−${(15 - cycle * 15).toFixed(1)} cm`;
          },
        });
      }
    );
  }, []);

  return (
    <div
      ref={(n) => { scope.current = n; shell.current = n; }}
      className="fixed z-40 hidden lg:flex flex-col items-center gap-2"
      style={{ right: 26, top: "50%", transform: "translateY(-50%)", opacity: 0 }}
      aria-hidden="true"
    >
      <div className="ch-data" style={{ fontSize: 9, letterSpacing: ".14em", color: C.mute }}>AWD TUBE</div>
      <svg width="46" height="190" viewBox="0 0 46 190">
        <defs>
          <clipPath id="tubeClip"><rect x="12" y="10" width="22" height="168" rx="11" /></clipPath>
        </defs>
        <rect x="12" y="10" width="22" height="168" rx="11" fill="#fff" stroke={C.line} />
        <g clipPath="url(#tubeClip)">
          <rect ref={water} x="12" y="120" width="22" height="58" fill={C.water} opacity="0.85" />
          <rect ref={crest} className="ch-ripple" x="12" y="117" width="22" height="6" fill={C.waterDeep} opacity="0.5" />
        </g>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle key={i} cx="23" cy={30 + i * 19} r="1.6" fill={C.field} opacity="0.35" />
        ))}
        {/* safe re-irrigation threshold */}
        <line x1="6" y1="132" x2="40" y2="132" stroke={C.husk} strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <div ref={label} className="ch-data text-center" style={{ fontSize: 10, color: C.field, fontWeight: 600 }}>
        −15.0 cm
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   4 · TOP BAR
   Progress rule scrubbed by GSAP; the active-section pill is a framer layoutId
   so it glides between items instead of cutting.
---------------------------------------------------------------------------- */
const NAV = [
  ["summary", "Summary"], ["location", "Location"], ["interventions", "Interventions"],
  ["governance", "Governance"], ["sequence", "Sequence"], ["testimonials", "Voices"],
  ["photography", "Photography"], ["benefits", "AWD benefits"], ["results", "Results"],
  ["season", "Season"], ["economics", "Economics"], ["sourcing", "Sourcing"], ["evidence", "Evidence"],
];

function TopBar() {
  const [solid, setSolid] = useState(false);
  const [active, setActive] = useState("summary");
  const bar = useRef(null);

  const scope = useGsapContext(() => {
    // scrubbed progress rule
    gsap.fromTo(
      bar.current,
      { scaleX: 0 },
      {
        scaleX: 1, ease: "none", transformOrigin: "left center",
        scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.3 },
      }
    );
    // background solidifies once past the hero
    ScrollTrigger.create({
      trigger: document.body, start: "top+=90 top",
      onEnter: () => setSolid(true), onLeaveBack: () => setSolid(false),
    });
    // active-section tracking feeds the layoutId pill
    NAV.forEach(([id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      ScrollTrigger.create({
        trigger: el, start: "top 45%", end: "bottom 45%",
        onToggle: (st) => st.isActive && setActive(id),
      });
    });
  }, []);

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <motion.header
      ref={scope}
      className="fixed top-0 left-0 right-0 z-50"
      initial={{ y: -70 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
      style={{
        background: solid ? "rgba(10,31,22,.92)" : "transparent",
        backdropFilter: solid ? "blur(12px)" : "none",
        transition: "background .4s ease, backdrop-filter .4s ease",
      }}
    >
      <div className="flex items-center gap-4 px-5 md:px-10" style={{ height: 58 }}>
        {/* ClearHarvest mark - real logo drops into LogoSlot via `src` */}
        <Magnetic strength={0.2}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
            <LogoSlot name="ClearHarvest" light height={26} />
          </button>
        </Magnetic>

        <LayoutGroup id="nav">
          <nav className="ch-scroll flex-1 hidden md:flex gap-1 overflow-x-auto">
            {NAV.map(([id, labelText]) => (
              <button
                key={id}
                onClick={() => go(id)}
                className="relative ch-data px-3 py-1.5 rounded"
                style={{ fontSize: 10.5, letterSpacing: ".08em", color: active === id ? "#fff" : "rgba(255,255,255,.55)", whiteSpace: "nowrap", transition: "color .3s ease" }}
              >
                {active === id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded"
                    style={{ background: "rgba(255,255,255,.12)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative">{labelText.toUpperCase()}</span>
              </button>
            ))}
          </nav>
        </LayoutGroup>

        {/* Grow Indigo mark, mirrored right */}
        <div className="ml-auto md:ml-0">
          <LogoSlot name="Grow Indigo" align="right" light height={26} />
        </div>
      </div>
      <div style={{ height: 2, background: "rgba(255,255,255,.12)" }}>
        <div ref={bar} style={{ height: 2, background: C.husk, transformOrigin: "left center" }} />
      </div>
    </motion.header>
  );
}

/* ----------------------------------------------------------------------------
   5 · HERO
   One orchestrated GSAP timeline on load - water recedes, the field grows in,
   the headline rises out of its masks. A second scrubbed trigger hands the
   hero off to the next section with a parallax lift and fade.
---------------------------------------------------------------------------- */
const HERO_LINES = [["Low-Emission"], ["Rice", "Offtake"]];
const HERO_META = [
  ["Season", "Rabi 2026"],
  ["Programme", "ClearHarvest by Grow Indigo"],
  ["Geography", "Varni & Chandur blocks, Telangana"],
  ["Quantification", "Cool Farm Platform V3.0"],
];

function Hero() {
  const scope = useGsapContext((self, el) => {
    const q = gsap.utils.selector(el);
    gsap.set(q(".hero-word"), { yPercent: 115 });
    gsap.set([q(".hero-eyebrow"), q(".hero-lede"), q(".hero-meta > *"), q(".hero-cue")], { autoAlpha: 0, y: 24 });

    // master load timeline
    const tl = gsap.timeline({ defaults: { ease: GSAP_EASE } });
    tl.to(q(".hero-water"), { attr: { height: 96 }, opacity: 0.16, duration: 2.2, ease: "power2.inOut" }, 0)
      .fromTo(q(".hero-blade"), { scaleY: 0, transformOrigin: "bottom center", opacity: 0 },
        { scaleY: 1, opacity: 0.55, duration: 1.4, stagger: { each: 0.012, from: "center" } }, 0.15)
      .to(q(".hero-eyebrow"), { autoAlpha: 1, y: 0, duration: 0.8 }, 0.35)
      .to(q(".hero-word"), { yPercent: 0, duration: 1.1, stagger: 0.09, ease: "expo.out" }, 0.5)
      .to(q(".hero-lede"), { autoAlpha: 1, y: 0, duration: 0.9 }, 1.05)
      .to(q(".hero-meta > *"), { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 1.2)
      .to(q(".hero-cue"), { autoAlpha: 1, y: 0, duration: 0.6 }, 1.6);

    // hand-off: content lifts and dissolves, field drifts down (depth)
    gsap.matchMedia().add({ ok: "(prefers-reduced-motion: no-preference)" }, () => {
      gsap.to(q(".hero-content"), {
        yPercent: -14, autoAlpha: 0, ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.5 },
      });
      gsap.to(q(".hero-field"), {
        yPercent: 12, ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.5 },
      });
    });
  }, []);

  return (
    <div ref={scope} className="relative flex flex-col justify-end" style={{ minHeight: "100vh", background: C.ink }}>
      <svg className="hero-field absolute inset-0 w-full h-full ch-scrub" preserveAspectRatio="none" viewBox="0 0 1200 800" aria-hidden="true">
        <defs>
          <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A1F16" />
            <stop offset="62%" stopColor="#0E3324" />
            <stop offset="100%" stopColor="#12566B" />
          </linearGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#skyG)" />
        {/* the flooded sheet drains on load - AWD stated in one gesture */}
        <rect className="hero-water" x="0" y="620" width="1200" height="180" fill={C.water} opacity="0.42" />
        {Array.from({ length: 46 }).map((_, i) => {
          const x = 20 + i * 26;
          const h = 46 + ((i * 37) % 40);
          return (
            <g key={i} className="hero-blade">
              <path d={`M${x} 720 q4 -${h} 10 -${h + 12}`} stroke={C.leaf} strokeWidth="1.4" fill="none" opacity=".7" />
              <path d={`M${x} 720 q-6 -${h - 10} -14 -${h}`} stroke={C.leaf} strokeWidth="1.2" fill="none" opacity=".5" />
            </g>
          );
        })}
      </svg>

      <div className="hero-content relative px-5 md:px-10 pb-16 md:pb-24 pt-32 mx-auto w-full ch-scrub" style={{ maxWidth: 1180 }}>
        {/* letterhead lockup: ClearHarvest left, Grow Indigo mirrored right */}
        <div className="hero-eyebrow">
          <div style={{ maxWidth: 560 }}>
            <LogoLockup light height={38} />
          </div>
          <div className="mt-8">
            <Eyebrow color={C.husk}>Nizamabad, Telangana · 23 villages · 309 mapped fields</Eyebrow>
          </div>
        </div>

        <h1 className="ch-display mt-6" style={{ color: "#fff", fontWeight: 800, fontSize: "clamp(2.6rem, 8vw, 6.4rem)", maxWidth: "16ch" }}>
          {HERO_LINES.map((line, li) => (
            <span key={li} className="ch-mask">
              {line.map((w, wi) => (
                <span key={wi} className="hero-word" style={{ display: "inline-block" }}>
                  {w}
                  {li === 1 && wi === line.length - 1 ? <span style={{ color: C.husk }}>.</span> : "\u00A0"}
                </span>
              ))}
            </span>
          ))}
        </h1>

        <p className="hero-lede mt-7 text-lg md:text-xl" style={{ color: "rgba(255,255,255,.78)", maxWidth: "56ch", lineHeight: 1.6 }}>
          Across 1,718 acres in Nizamabad, farmers stopped flooding their fields continuously - and cut the carbon in
          every tonne of rice by half. Every field mapped, every claim traced.
        </p>

        <div className="hero-meta mt-10 flex flex-wrap gap-x-10 gap-y-5">
          {HERO_META.map(([k, v]) => (
            <div key={k}>
              <div className="ch-data" style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(255,255,255,.45)" }}>
                {k.toUpperCase()}
              </div>
              <div style={{ color: "#fff", fontWeight: 500, fontSize: 15, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hero-cue relative pb-8 flex justify-center" aria-hidden="true">
        <motion.svg
          width="20" height="26" viewBox="0 0 20 26"
          animate={{ y: [0, 7, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <path d="M10 2v20M3 15l7 7 7-7" stroke="rgba(255,255,255,.6)" strokeWidth="1.4" fill="none" />
        </motion.svg>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   6 · IMPACT COUNTERS
   GSAP ticks each number; framer handles the tilt and hover lift.
---------------------------------------------------------------------------- */
const HEADLINES = [
  { value: 300, suffix: "", label: "Paddy farmers", note: "enrolled across 23 villages", tone: C.field },
  { value: 1718, suffix: "", label: "Acres under AWD", note: "Varni & Chandur blocks, Nizamabad", tone: C.field },
  { value: 51, suffix: "%", label: "GHG reduction", note: "vs ABC baseline of 1,325 kg CO₂e/MT", tone: C.leaf },
  { value: 45, prefix: "~", suffix: "%", label: "Water saved", note: "3,250 → ~1,788 litres per kg paddy", tone: C.water },
  { value: 600, suffix: "", label: "Acres baled", note: "double the 300-acre CRM target", tone: C.husk },
  { value: 26, suffix: "%", label: "Less nitrogen", note: "48 → 35.6 kg N/acre vs PJTSAU dose", tone: C.clay },
];

const TICKER = [
  "679.13 kg CO₂e/MT reduced",
  "51% below ABC baseline",
  "~45% water saved",
  "26% less nitrogen",
  "600 acres baled",
  "23 villages",
  "16 farmers sampled & audited",
];

/** Seamless GSAP marquee. Two copies of the strip, x wrapped modulo width. */
function Ticker() {
  const scope = useGsapContext((self, el) => {
    const track = el.querySelector(".ticker-track");
    const half = track.scrollWidth / 2;
    const tween = gsap.to(track, { x: -half, duration: 28, ease: "none", repeat: -1 });
    // slows to a crawl on hover so a reader can actually catch a figure
    el.addEventListener("mouseenter", () => gsap.to(tween, { timeScale: 0.15, duration: 0.6 }));
    el.addEventListener("mouseleave", () => gsap.to(tween, { timeScale: 1, duration: 0.6 }));
  }, []);
  return (
    <div ref={scope} className="overflow-hidden" style={{ background: C.ink, padding: "14px 0" }}>
      <div className="ticker-track flex" style={{ width: "max-content" }}>
        {[...TICKER, ...TICKER].map((t, i) => (
          <div key={i} className="ch-data flex items-center" style={{ fontSize: 12, color: "rgba(255,255,255,.72)", letterSpacing: ".06em", padding: "0 28px" }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: C.husk, marginRight: 14 }} />
            {t.toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ stat }) {
  return (
    <motion.div className="stat-card h-full" whileHover={{ y: -6 }} transition={{ duration: 0.35, ease: EASE }}>
      <div className="p-6 md:p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="ch-display" style={{ color: stat.tone, fontWeight: 800, fontSize: "clamp(2.2rem,5vw,3.2rem)" }}>
          <Counter value={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix || ""} />
        </div>
        <div className="mt-1" style={{ fontWeight: 600, fontSize: 15, color: C.ink }}>{stat.label}</div>
        <div className="ch-data mt-2" style={{ fontSize: 11, color: C.mute, lineHeight: 1.6 }}>{stat.note}</div>
      </div>
    </motion.div>
  );
}

function ImpactStrip() {
  const grid = useBatchReveal(".stat-card", { stagger: 0.07 });
  return (
    <>
      <Ticker />
      <Section id="summary" tone="tint">
        <SectionHead
          index="01"
          title="What the season delivered"
          lede="The Low-Emission Rice Offtake project promoted Alternate Wetting & Drying (AWD)–based regenerative practices that cut greenhouse gas emissions, improved water-use efficiency and strengthened long-term soil health - verified farm to mill."
        />
        <div ref={grid} className="grid gap-4 md:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HEADLINES.map((s) => <StatCard key={s.label} stat={s} />)}
        </div>

        <div className="grid gap-8 lg:grid-cols-3 mt-14">
          <Reveal className="lg:col-span-2">
            <h3 className="ch-display text-2xl md:text-3xl" style={{ color: C.field, fontWeight: 700 }}>Why this project exists</h3>
            <p className="mt-4" style={{ lineHeight: 1.75, color: C.ink, maxWidth: "68ch" }}>
              Rice is one of the most water-intensive crops on earth, and traditional flooded cultivation is a
              significant source of methane - while exposing farmers to erratic rainfall, rising temperatures and
              declining groundwater. Against that backdrop the project introduced regenerative interventions focused on{" "}
              <strong>water</strong>, <strong>soil</strong> and <strong>implementation competencies</strong>.
            </p>
            <p className="mt-4" style={{ lineHeight: 1.75, color: C.mute, maxWidth: "68ch" }}>
              Participating farmers kept their prevailing rice establishment method. The single change at the centre of
              the programme was irrigation: AWD replaced continuous flooding with monitored wetting–drying cycles to
              conserve water and suppress methane formation. Everything else - biologicals, residue management, digital
              traceability - was built around making that change stick and making it auditable.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <motion.div
              className="p-6 rounded-lg h-full"
              style={{ background: C.ink }}
              whileHover={{ scale: 1.015 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <Eyebrow color={C.husk}>The claim, in one line</Eyebrow>
              <p className="ch-display mt-4 text-xl md:text-2xl" style={{ color: "#fff", fontWeight: 600, lineHeight: 1.25 }}>
                A scalable, farmer-centric model for low-emission rice that is transparent, traceable and ready for
                climate-aligned procurement.
              </p>
              <div className="ch-data mt-6 pt-4" style={{ fontSize: 11, color: "rgba(255,255,255,.55)", borderTop: "1px solid rgba(255,255,255,.15)", lineHeight: 1.7 }}>
                419 farmers enrolled · 249 completed procurement · 16 sampled for quantification by the square-root method
              </div>
            </motion.div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------------------
   7 · PROJECT LOCATION - four-level KML drill-down
   India → Telangana → Nizamabad → village → individual farmer field.

   Levels 0–2 share one geographic projection and zoom by animating a group
   transform. Level 3 switches to a local plot view because farmer fields are
   ~0.002° across - at national scale they would be sub-pixel, and pushing the
   zoom that far introduces float noise in the path data.

   ⟵ DATA: FIELDS below is generated from a seeded PRNG so the layout is
   stable across renders. Replace `buildFields()` with your FieldKhata KML
   export - parse each <Placemark> into { id, farmer, acres, village, ring }
   where ring is an array of [lon, lat] pairs, and everything downstream works
   unchanged.
---------------------------------------------------------------------------- */
const BBOX = { lon0: 67.0, lon1: 98.5, lat0: 5.5, lat1: 37.5 };
const MAP_W = 560;
const MAP_H = 640;

function project([lon, lat]) {
  const x = ((lon - BBOX.lon0) / (BBOX.lon1 - BBOX.lon0)) * MAP_W;
  const y = ((BBOX.lat1 - lat) / (BBOX.lat1 - BBOX.lat0)) * MAP_H;
  return [x, y];
}
const ring = (pts) => pts.map((pt, i) => `${i ? "L" : "M"}${project(pt).map((n) => n.toFixed(1)).join(" ")}`).join(" ") + " Z";

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

/* Five project villages, positioned from the GPS stamps on the field
   photographs in the annexures. Field counts sum to 309. */
const VILLAGES = [
  { key: "ghanpur",    name: "Ghanpur",    lon: 77.9271, lat: 18.5734, fields: 78, block: "Chandur" },
  { key: "sangam",     name: "Sangam",     lon: 77.9121, lat: 18.6038, fields: 64, block: "Chandur" },
  { key: "kunipoor",   name: "Kunipoor",   lon: 77.9406, lat: 18.5111, fields: 71, block: "Varni"   },
  { key: "srinagar",   name: "Srinagar",   lon: 77.9253, lat: 18.5371, fields: 52, block: "Varni"   },
  { key: "bhavanipet", name: "Bhavanipet", lon: 77.9251, lat: 18.5801, fields: 44, block: "Chandur" },
];
const TOTAL_FIELDS = VILLAGES.reduce((n, v) => n + v.fields, 0); // 309

/* Deterministic name pool - replace wholesale when the real KML lands. */
const SURNAMES = ["Kolluri", "Gundeti", "Bandari", "Mekala", "Pochampally", "Nalla", "Yerram", "Kandula", "Bhoomaiah", "Sirikonda", "Racha", "Dharmapuri", "Vemula", "Jangam", "Peddi"];
const GIVEN = ["Gangaram", "Venu", "Ashok", "Narsimha", "Ramulu", "Srinivas", "Lakshmi", "Anjaiah", "Mallesh", "Sailu", "Rajitha", "Kumar", "Padma", "Bhaskar", "Swaroopa", "Ravi"];

/** Mulberry32 - small, fast, seedable. Keeps the plot layout identical on
 *  every render so hover targets never jump between paints. */
function prng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds field polygons in a local 0–100 plot space per village. Fields are
 *  irregular quadrilaterals on a jittered grid - the shape real bunded paddy
 *  plots take when digitised from a walked boundary. */
function buildFields() {
  const out = [];
  VILLAGES.forEach((v, vi) => {
    const rand = prng(vi * 7919 + 13);
    const cols = Math.ceil(Math.sqrt(v.fields * 1.35));
    const rows = Math.ceil(v.fields / cols);
    const cw = 100 / cols;
    const chh = 100 / rows;
    for (let i = 0; i < v.fields; i++) {
      const cx = (i % cols) * cw;
      const cy = Math.floor(i / cols) * chh;
      const j = () => (rand() - 0.5) * cw * 0.28;
      const pad = cw * 0.12;
      const x0 = cx + pad + j(), y0 = cy + pad + j();
      const x1 = cx + cw - pad + j(), y1 = cy + pad + j();
      const x2 = cx + cw - pad + j(), y2 = cy + chh - pad + j();
      const x3 = cx + pad + j(), y3 = cy + chh - pad + j();
      const acres = +(2.1 + rand() * 12.4).toFixed(1);
      out.push({
        id: `${v.key.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        village: v.key,
        villageName: v.name,
        block: v.block,
        farmer: `${SURNAMES[Math.floor(rand() * SURNAMES.length)]} ${GIVEN[Math.floor(rand() * GIVEN.length)]}`,
        acres,
        awd: rand() > 0.06,          // AWD pipe installed & logged
        crm: rand() > 0.62,          // residue baled rather than burnt
        d: `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}Z`,
        cx: (x0 + x1 + x2 + x3) / 4,
        cy: (y0 + y1 + y2 + y3) / 4,
      });
    }
  });
  return out;
}
const FIELDS = buildFields();

/* Zoom targets for levels 0–2, in projected pixel space. */
const VIEWS = {
  india: { cx: MAP_W / 2, cy: MAP_H / 2, scale: 1 },
  telangana: (() => { const [x, y] = project([78.8, 17.9]); return { cx: x, cy: y, scale: 3.4 }; })(),
  district: (() => { const [x, y] = project(NIZAMABAD); return { cx: x, cy: y, scale: 11 }; })(),
};

const LEVELS = ["india", "telangana", "district", "village"];
const LEVEL_LABEL = { india: "India", telangana: "Telangana", district: "Nizamabad district", village: "Village" };

/** Levels 0–2: the geographic view. A single <g> carries the zoom so the
 *  outline, state fill and village pins all move together. */
function GeoView({ level, hoverVillage, setHoverVillage, onPickVillage }) {
  const view = VIEWS[level] || VIEWS.india;
  const showVillages = level === "district";

  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto" role="img" aria-label={`Map: ${LEVEL_LABEL[level]}`}>
      <defs>
        <linearGradient id="tgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.leaf} />
          <stop offset="100%" stopColor={C.field} />
        </linearGradient>
      </defs>

      <motion.g
        animate={{
          scale: view.scale,
          x: MAP_W / 2 - view.cx * view.scale,
          y: MAP_H / 2 - view.cy * view.scale,
        }}
        initial={false}
        transition={{ duration: 1.05, ease: EASE }}
        style={{ transformOrigin: "0px 0px" }}
      >
        <path d={ring(INDIA)} fill={C.paperDim} stroke={C.line} strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        <motion.path
          d={ring(TELANGANA)}
          fill="url(#tgGrad)"
          stroke="#fff"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
          animate={{ fillOpacity: level === "india" ? 0.65 : 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* district marker, only meaningful once Telangana fills the frame */}
        <AnimatePresence>
          {level !== "india" && (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              {(() => {
                const [x, y] = project(NIZAMABAD);
                return (
                  <>
                    <circle cx={x} cy={y} r={2.6 / view.scale} fill={C.husk} stroke="#fff" strokeWidth={0.8 / view.scale} />
                    {level === "telangana" && (
                      <text x={x + 4 / view.scale} y={y - 3 / view.scale} className="ch-data" fontSize={4 / view.scale} fill="#fff" fontWeight="600">
                        Nizamabad
                      </text>
                    )}
                  </>
                );
              })()}
            </motion.g>
          )}
        </AnimatePresence>

        {/* the five project villages */}
        <AnimatePresence>
          {showVillages &&
            VILLAGES.map((v, i) => {
              const [x, y] = project([v.lon, v.lat]);
              const on = hoverVillage === v.key;
              const r = (on ? 3.4 : 2.4) / view.scale;
              return (
                <motion.g
                  key={v.key}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ duration: 0.45, delay: 0.25 + i * 0.07, ease: EASE }}
                  style={{ cursor: "pointer", transformOrigin: `${x}px ${y}px` }}
                  onMouseEnter={() => setHoverVillage(v.key)}
                  onMouseLeave={() => setHoverVillage(null)}
                  onClick={() => onPickVillage(v.key)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onPickVillage(v.key)}
                  role="button"
                  aria-label={`${v.name} - ${v.fields} farmer fields`}
                >
                  <circle cx={x} cy={y} r={r * 2.4} fill={C.husk} opacity={on ? 0.22 : 0.1} />
                  <circle cx={x} cy={y} r={r} fill={on ? "#fff" : C.husk} stroke={C.ink} strokeWidth={0.5 / view.scale} />
                  <text
                    x={x + 5 / view.scale}
                    y={y + 1.4 / view.scale}
                    className="ch-data"
                    fontSize={3.4 / view.scale}
                    fill="#fff"
                    fontWeight="600"
                  >
                    {v.name}
                  </text>
                  <text x={x + 5 / view.scale} y={y + 5.4 / view.scale} className="ch-data" fontSize={2.8 / view.scale} fill="rgba(255,255,255,.75)">
                    {v.fields} fields
                  </text>
                </motion.g>
              );
            })}
        </AnimatePresence>
      </motion.g>
    </svg>
  );
}

/** Level 3: the KML plot view. Each polygon is one farmer's field. */
function PlotView({ village, hoverField, setHoverField, selected, onPickField }) {
  const v = VILLAGES.find((x) => x.key === village);
  const fields = FIELDS.filter((f) => f.village === village);

  // fields wash in row by row, the way a KML layer paints as it loads
  const scope = useGsapContext((self, el) => {
    gsap.fromTo(
      el.querySelectorAll(".plot"),
      { opacity: 0, scale: 0.4, transformOrigin: "center" },
      { opacity: 1, scale: 1, duration: 0.5, ease: GSAP_EASE, stagger: { each: 0.006, from: "start" } }
    );
  }, [village]);

  return (
    <svg ref={scope} viewBox="-6 -6 112 112" className="w-full h-auto" role="img" aria-label={`${v.name}: ${v.fields} mapped farmer fields`}>
      {/* village bund / access track, for orientation */}
      <path d="M-6 46 L112 52" stroke={C.line} strokeWidth="1.6" fill="none" strokeDasharray="3 2" />
      <path d="M48 -6 L52 112" stroke={C.line} strokeWidth="1.2" fill="none" strokeDasharray="3 2" />

      {fields.map((f) => {
        const on = hoverField === f.id;
        const sel = selected === f.id;
        return (
          <path
            key={f.id}
            className="plot"
            d={f.d}
            fill={sel ? C.husk : on ? C.leaf : f.awd ? C.field : C.mute}
            fillOpacity={sel || on ? 1 : 0.55}
            stroke="#fff"
            strokeWidth="0.28"
            style={{ cursor: "pointer", transition: "fill .18s ease, fill-opacity .18s ease" }}
            onMouseEnter={() => setHoverField(f.id)}
            onMouseLeave={() => setHoverField(null)}
            onClick={() => onPickField(f.id)}
            tabIndex={0}
            onFocus={() => setHoverField(f.id)}
            onBlur={() => setHoverField(null)}
            onKeyDown={(e) => e.key === "Enter" && onPickField(f.id)}
            role="button"
            aria-label={`${f.id}, ${f.farmer}, ${f.acres} acres`}
          />
        );
      })}
    </svg>
  );
}

/** Breadcrumb - doubles as the up-navigation. */
function MapCrumbs({ level, village, onGo }) {
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
    <LayoutGroup id="crumbs">
      <div className="flex flex-wrap items-center gap-1.5">
        {trail.map((t, i) => {
          const isCurrent = i === idx;
          return (
            <React.Fragment key={t.key}>
              {i > 0 && <span className="ch-data" style={{ color: C.line, fontSize: 11 }}>/</span>}
              <motion.button
                onClick={() => onGo(t.key)}
                className="relative ch-data px-2.5 py-1 rounded"
                style={{ fontSize: 10.5, letterSpacing: ".08em", color: isCurrent ? "#fff" : C.mute, fontWeight: 600 }}
                whileHover={{ color: isCurrent ? "#fff" : C.field }}
                disabled={i > idx}
              >
                {isCurrent && (
                  <motion.span layoutId="crumb-pill" className="absolute inset-0 rounded" style={{ background: C.field }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{t.label?.toUpperCase()}</span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function DetailRow({ k, v, accent }) {
  return (
    <div className="flex justify-between gap-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
      <span className="ch-data" style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", letterSpacing: ".08em" }}>{k.toUpperCase()}</span>
      <span style={{ fontSize: 13.5, color: accent || "#fff", fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

/** The panel that answers "what am I looking at" at every level. */
function MapPanel({ level, village, field, hoverVillage, hoverField }) {
  const shownVillage = village || hoverVillage;
  const v = VILLAGES.find((x) => x.key === shownVillage);
  const f = FIELDS.find((x) => x.id === (field || hoverField));

  let body;
  if (level === "village" && f) {
    body = (
      <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: EASE }}>
        <Eyebrow color={C.husk}>Farmer field · KML polygon</Eyebrow>
        <h3 className="ch-display mt-4 text-2xl md:text-3xl" style={{ color: "#fff", fontWeight: 700 }}>{f.farmer}</h3>
        <div className="mt-5">
          <DetailRow k="Field ID" v={f.id} />
          <DetailRow k="Area" v={`${f.acres} acres`} accent={C.leaf} />
          <DetailRow k="Village" v={f.villageName} />
          <DetailRow k="Block" v={f.block} />
          <DetailRow k="AWD pipe" v={f.awd ? "Installed & logged" : "Not enrolled"} accent={f.awd ? C.leaf : "rgba(255,255,255,.5)"} />
          <DetailRow k="Residue" v={f.crm ? "Baled - no burning" : "Retained in field"} accent={f.crm ? C.husk : undefined} />
        </div>
        <p className="ch-data mt-5" style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)", lineHeight: 1.7 }}>
          Boundary captured by the Kisan Advisor in FieldKhata and quality-checked by the scientific team before GHG accounting.
        </p>
      </motion.div>
    );
  } else if ((level === "village" || level === "district") && v) {
    body = (
      <motion.div key={v.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: EASE }}>
        <Eyebrow color={C.husk}>{v.block} block</Eyebrow>
        <h3 className="ch-display mt-4 text-2xl md:text-3xl" style={{ color: "#fff", fontWeight: 700 }}>{v.name}</h3>
        <div className="mt-5">
          <DetailRow k="Mapped fields" v={<Counter value={v.fields} />} accent={C.leaf} />
          <DetailRow k="Coordinates" v={`${v.lat.toFixed(4)}°N ${v.lon.toFixed(4)}°E`} />
          <DetailRow k="District" v="Nizamabad, Telangana" />
        </div>
        <p className="mt-5" style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,.7)" }}>
          {level === "district"
            ? "Open the village to see every mapped farmer field, with name and area on each polygon."
            : "Hover or tap any polygon for the farmer's name, field ID and area."}
        </p>
      </motion.div>
    );
  } else {
    body = (
      <motion.div key={level} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: EASE }}>
        <Eyebrow color={C.husk}>{LEVEL_LABEL[level]}</Eyebrow>
        <h3 className="ch-display mt-4 text-2xl md:text-3xl" style={{ color: "#fff", fontWeight: 700 }}>
          {level === "india" ? "Where the rice comes from" : "Nizamabad district"}
        </h3>
        <div className="mt-5">
          <DetailRow k="Mapped fields" v={<Counter value={TOTAL_FIELDS} />} accent={C.leaf} />
          <DetailRow k="Villages" v={`${VILLAGES.length} of 23`} />
          <DetailRow k="Blocks" v="Varni & Chandur" />
          <DetailRow k="Emission reduction" v="679.13 kg CO₂e/MT" accent={C.leaf} />
        </div>
        <p className="mt-5" style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,.7)" }}>
          Every enrolled field was geofenced in FieldKhata as a KML boundary. Drill down to open the polygons and read
          the farmer name, field ID and area recorded against each one.
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

function LocationSection() {
  const [level, setLevel] = useState("india");
  const [village, setVillage] = useState(null);
  const [field, setField] = useState(null);
  const [hoverVillage, setHoverVillage] = useState(null);
  const [hoverField, setHoverField] = useState(null);

  // the drill runs itself once on first view, then hands control to the reader
  const auto = useRef(false);
  const scope = useGsapContext((self, el) => {
    ScrollTrigger.create({
      trigger: el,
      start: "top 65%",
      once: true,
      onEnter: () => {
        if (auto.current) return;
        auto.current = true;
        gsap.delayedCall(0.4, () => setLevel("telangana"));
        gsap.delayedCall(1.7, () => setLevel("district"));
      },
    });
  }, []);

  const goto = (key) => {
    if (key === "village") return;
    setLevel(key);
    if (key !== "village") { setField(null); setHoverField(null); }
    if (key === "india" || key === "telangana") { setVillage(null); }
  };

  const pickVillage = (key) => { setVillage(key); setLevel("village"); setField(null); };

  return (
    <Section id="location">
      <SectionHead
        index="02"
        title="Every field on the map"
        lede={`The programme ran in the Varni and Chandur blocks of Nizamabad district, Telangana. All ${TOTAL_FIELDS} enrolled farmer fields were geofenced as KML boundaries in FieldKhata - drill from the country down to a single plot.`}
      />

      <div ref={scope} className="grid gap-6 lg:grid-cols-5 items-start">
        <div className="lg:col-span-3">
          <div className="p-4 md:p-6 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <MapCrumbs level={level} village={village} onGo={goto} />
              <AnimatePresence>
                {level !== "india" && (
                  <motion.button
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    onClick={() => goto(LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)])}
                    className="ch-data px-3 py-1.5 rounded"
                    style={{ fontSize: 10, letterSpacing: ".1em", color: C.mute, border: `1px solid ${C.line}` }}
                  >
                    ← ZOOM OUT
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div style={{ position: "relative", minHeight: 340 }}>
              <AnimatePresence mode="wait">
                {level === "village" ? (
                  <motion.div key="plots" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: 0.5, ease: EASE }}>
                    <PlotView
                      village={village}
                      hoverField={hoverField}
                      setHoverField={setHoverField}
                      selected={field}
                      onPickField={setField}
                    />
                  </motion.div>
                ) : (
                  <motion.div key="geo" initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.5, ease: EASE }}>
                    <GeoView
                      level={level}
                      hoverVillage={hoverVillage}
                      setHoverVillage={setHoverVillage}
                      onPickVillage={pickVillage}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* legend + village shortcuts */}
            <div className="mt-4 pt-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderTop: `1px solid ${C.line}` }}>
              {level === "village" ? (
                <>
                  {[[C.field, "AWD field"], [C.leaf, "Hovered"], [C.husk, "Selected"], [C.mute, "Not enrolled"]].map(([c, l]) => (
                    <span key={l} className="ch-data flex items-center gap-2" style={{ fontSize: 10, color: C.mute }}>
                      <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
                      {l.toUpperCase()}
                    </span>
                  ))}
                </>
              ) : (
                VILLAGES.map((v) => (
                  <motion.button
                    key={v.key}
                    onClick={() => pickVillage(v.key)}
                    onMouseEnter={() => setHoverVillage(v.key)}
                    onMouseLeave={() => setHoverVillage(null)}
                    whileHover={{ y: -2 }}
                    className="ch-data"
                    style={{ fontSize: 10.5, color: C.field, fontWeight: 600, letterSpacing: ".05em" }}
                  >
                    {v.name.toUpperCase()} <span style={{ color: C.mute }}>{v.fields}</span>
                  </motion.button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <MapPanel level={level} village={village} field={field} hoverVillage={hoverVillage} hoverField={hoverField} />
        </div>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   8 · THE THREE INTERVENTIONS
   Hover opens the mechanism drawer (framer height auto + staggered children);
   the card itself tilts and lifts. Tap does the same on touch.
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

function InterventionCard({ item }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  return (
    <motion.div className="interv-card h-full" whileHover={{ y: -7 }} transition={{ duration: 0.35, ease: EASE }}>
      <motion.div
        className="rounded-lg h-full p-7 md:p-8"
        style={{ background: "#fff", border: `1px solid ${C.line}`, borderTop: `3px solid ${item.color}`, cursor: "pointer" }}
        onHoverStart={() => setOpen(true)}
        onHoverEnd={() => setOpen(false)}
        onTap={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        whileHover={{ boxShadow: "0 26px 50px -30px rgba(10,31,22,.55)" }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <div className="flex items-start justify-between gap-4">
          <motion.svg
            width="34" height="34" viewBox="0 0 24 24" style={{ color: item.color }}
            animate={open ? { scale: 1.15, rotate: -4 } : { scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
          >
            {item.icon}
          </motion.svg>
          <Eyebrow color={item.color}>{item.tag}</Eyebrow>
        </div>

        <h3 className="ch-display mt-6 text-2xl" style={{ color: C.field, fontWeight: 700 }}>{item.title}</h3>
        <div className="ch-data mt-2" style={{ fontSize: 11.5, color: C.mute }}>{item.kicker}</div>

        {/* MECHANISM DRAWER */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="mech"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
              style={{ overflow: "hidden" }}
            >
              <motion.div variants={vStagger(0.06, 0.08)} initial="hidden" animate="show">
                <motion.p variants={vFadeUp} className="mt-5" style={{ lineHeight: 1.7, fontSize: 14.5, color: C.ink }}>
                  {item.mechanism}
                </motion.p>
                <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
                  {item.why.map(([k, v]) => (
                    <motion.div key={k} variants={vFadeUp} className="mb-2.5">
                      <span className="ch-data" style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{k.toUpperCase()}</span>
                      <span style={{ fontSize: 13.5, color: C.mute, marginLeft: 8 }}>{v}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ul className="mt-6 space-y-2">
          {item.benefits.map((b) => (
            <motion.li
              key={b}
              className="flex gap-3"
              style={{ fontSize: 14, lineHeight: 1.6, color: C.ink }}
              whileHover={{ x: 4 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <span style={{ color: item.color, fontWeight: 700 }}>▸</span>
              <span>{b}</span>
            </motion.li>
          ))}
        </ul>

        <div className="ch-data mt-6" style={{ fontSize: 10, color: C.mute, letterSpacing: ".1em" }}>
          {open ? "TAP TO CLOSE" : "HOVER OR TAP FOR THE MECHANISM"}
        </div>
      </motion.div>
    </motion.div>
  );
}

function InterventionsSection() {
  const grid = useBatchReveal(".interv-card", { stagger: 0.12 });
  return (
    <Section id="interventions" tone="tint">
      <SectionHead
        index="03"
        title="Three interventions, one system"
        lede="Water, soil and residue were addressed together - each supported by the same field team, the same digital record and the same farmer. Hover any card to open its mechanism."
      />
      <div ref={grid} className="grid gap-5 lg:grid-cols-3">
        {INTERVENTIONS.map((it) => <InterventionCard key={it.key} item={it} />)}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   9 · GOVERNANCE - team structure, responsibilities, competencies
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

const WORKFLOW = [
  ["Kisan Advisor visits the farmer", "On-field engagement and practice verification"],
  ["Capability building on interventions", "Training on AWD, CRM and biological inputs"],
  ["Data capture on agronomic practices", "AWD and CRM logged in FieldKhata"],
  ["QC of field-reported data by scientists", "Methodological review and validation"],
  ["Procurement audit trail", "End-to-end record captured in S3 Sutra"],
  ["Third-party audit & report submission", "Independent verification and final delivery"],
];

const IPM = [
  ["Cultural control", "Timely agronomic operations, field sanitation, balanced nutrition, weed management and AWD-based water management."],
  ["Mechanical & physical", "Removal of infected plant parts, cleaning of field bunds, physical suppression of weeds and pest habitats."],
  ["Biological control", "Biological inputs and practices that improved soil and crop health and encouraged beneficial organisms."],
  ["Chemical control", "Recommended only when pest or disease pressure required it - correct pesticide, dosage and crop stage."],
];

function OrgChart() {
  // the tree assembles top-down: PMU, connector, then each branch in turn
  const scope = useGsapContext((self, el) => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top 80%", once: true },
      defaults: { ease: GSAP_EASE, duration: 0.6 },
    });
    tl.from(el.querySelectorAll(".org-root"), { y: -18, autoAlpha: 0 })
      .from(el.querySelectorAll(".org-stem"), { scaleY: 0, transformOrigin: "top center", duration: 0.4 }, "-=0.2")
      .from(el.querySelectorAll(".org-branch"), { y: -14, autoAlpha: 0, stagger: 0.12 }, "-=0.1")
      .from(el.querySelectorAll(".org-leaf"), { x: -14, autoAlpha: 0, stagger: 0.07 }, "-=0.25");
  }, []);

  const node = (label, sub, bg, fg = "#fff", cls = "") => (
    <motion.div
      className={`px-4 py-3 rounded ${cls}`}
      style={{ background: bg, color: fg, minWidth: 0 }}
      whileHover={{ scale: 1.03, transition: { duration: 0.25, ease: EASE } }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      {sub && <div className="ch-data mt-1" style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.5 }}>{sub}</div>}
    </motion.div>
  );

  return (
    <div ref={scope} className="p-6 md:p-8 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <Eyebrow>ClearHarvest team structure</Eyebrow>
      <div className="mt-6 flex flex-col items-center">
        {node("PMU", "Project Management Unit · timely execution against milestones", C.field, "#fff", "org-root")}
        <div className="org-stem" style={{ width: 1, height: 22, background: C.line }} />
        <div className="grid gap-4 sm:grid-cols-2 w-full">
          <div>
            {node("Field Operations", null, C.leaf, "#fff", "org-branch")}
            <div className="mt-3 space-y-3">
              {node("RBM / Agronomist", "Regional field leadership & agronomic guidance", C.paperDim, C.ink, "org-leaf")}
              {node("TBM", "Team management & operational execution", C.paperDim, C.ink, "org-leaf")}
              {node("Kisan Advisors", "Farmer engagement, advisory & hand-holding", C.paperDim, C.ink, "org-leaf")}
            </div>
          </div>
          <div>
            {node("Science & Technology", null, C.water, "#fff", "org-branch")}
            <div className="mt-3 space-y-3">
              {node("Quantification Lead", "GHG quantification, data analysis & impact assessment", C.paperDim, C.ink, "org-leaf")}
              {node("Engineering Lead", "Digital tools, data systems & technology enablement", C.paperDim, C.ink, "org-leaf")}
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
            <motion.button
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="w-full flex items-center gap-4 px-6 py-4 text-left"
              aria-expanded={isOpen}
              whileHover={{ backgroundColor: "rgba(14,91,51,.04)" }}
              transition={{ duration: 0.2 }}
            >
              <span className="ch-data" style={{ fontSize: 11, color: C.husk, fontWeight: 600, width: 22 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <motion.span
                animate={{ color: isOpen ? C.field : C.ink, x: isOpen ? 4 : 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                style={{ fontWeight: 600, fontSize: 15, flex: 1 }}
              >
                {role}
              </motion.span>
              <motion.span
                animate={{ rotate: isOpen ? 135 : 0, color: isOpen ? C.field : C.mute }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                style={{ fontSize: 20, lineHeight: 1 }}
              >
                +
              </motion.span>
            </motion.button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <motion.ul
                    className="px-6 pb-5 space-y-2"
                    style={{ paddingLeft: 68 }}
                    variants={vStagger(0.05, 0.06)}
                    initial="hidden"
                    animate="show"
                  >
                    {duties.map((d) => (
                      <motion.li key={d} variants={vFadeUp} className="flex gap-3" style={{ fontSize: 14, lineHeight: 1.6, color: C.mute }}>
                        <span style={{ color: C.leaf }}>▸</span>
                        <span>{d}</span>
                      </motion.li>
                    ))}
                  </motion.ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function WorkflowStepper() {
  const [hover, setHover] = useState(null);
  const grid = useBatchReveal(".wf-step", { stagger: 0.06 });
  return (
    <LayoutGroup id="workflow">
      <div ref={grid} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORKFLOW.map(([title, sub], i) => {
          const on = hover === i;
          return (
            <motion.div
              key={title}
              className="wf-step relative p-5 rounded"
              onHoverStart={() => setHover(i)}
              onHoverEnd={() => setHover(null)}
              animate={{ y: on ? -4 : 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ background: "#fff", border: `1px solid ${on ? C.field : C.line}` }}
            >
              {on && (
                <motion.span
                  layoutId="wf-fill"
                  className="absolute inset-0 rounded"
                  style={{ background: C.field }}
                  transition={{ type: "spring", stiffness: 320, damping: 32 }}
                />
              )}
              <div className="relative">
                <div className="ch-data" style={{ fontSize: 11, fontWeight: 600, color: C.husk }}>STEP {i + 1}</div>
                <motion.div className="mt-2" animate={{ color: on ? "#fff" : C.ink }} style={{ fontWeight: 600, fontSize: 14.5 }}>
                  {title}
                </motion.div>
                <motion.div className="mt-1.5" animate={{ color: on ? "rgba(255,255,255,.72)" : C.mute }} style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  {sub}
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function GovernanceSection() {
  return (
    <Section id="governance">
      <SectionHead
        index="04"
        title="Who did what, and how it was checked"
        lede="Delivery ran through a layered implementation architecture. Strategic oversight sat with Grow Indigo's ClearHarvest team, keeping the programme aligned to ABC's sustainability objectives and reporting requirements."
      />
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Reveal><OrgChart /></Reveal>
        <Reveal delay={0.12}><RoleAccordion /></Reveal>
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
        <div className="mt-7"><WorkflowStepper /></div>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <Eyebrow>Theme 4 · Programme competencies</Eyebrow>
            <h4 className="ch-display mt-4 text-xl" style={{ color: C.field, fontWeight: 700 }}>
              Four IPM principles, applied in the field
            </h4>
            <Stagger className="mt-5 space-y-4" stagger={0.08}>
              {IPM.map(([k, v]) => (
                <motion.div key={k} variants={vFadeUp} whileHover={{ x: 4 }} transition={{ duration: 0.25 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{k}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: C.mute }}>{v}</div>
                </motion.div>
              ))}
            </Stagger>
            <p className="ch-data mt-5 pt-4" style={{ fontSize: 11.5, lineHeight: 1.7, color: C.mute, borderTop: `1px solid ${C.line}` }}>
              Regular monitoring by Kisan Advisors kept crop-protection decisions tied to actual field conditions
              rather than routine pesticide application.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.11}>
          <div className="p-7 rounded-lg h-full" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
            <Eyebrow>Farmer hand-holding</Eyebrow>
            <h4 className="ch-display mt-4 text-xl" style={{ color: C.field, fontWeight: 700 }}>
              A high-touch, phygital extension model
            </h4>
            <Stagger className="mt-5 space-y-4" stagger={0.07} style={{ fontSize: 14, lineHeight: 1.7, color: C.mute }}>
              <motion.p variants={vFadeUp}>
                <strong style={{ color: C.ink }}>Integrated Nutrient Management.</strong> Nutrient decisions combined
                farmer practice, crop-stage requirements, biological inputs, soil condition and split application of
                fertilisers - with Oorjit and Grow Phos as biological complements optimising nitrogen and phosphorus
                availability.
              </motion.p>
              <motion.p variants={vFadeUp}>
                <strong style={{ color: C.ink }}>Field visits.</strong> Kisan Advisors visited from transplanting to
                harvest: one-on-one support, on-field troubleshooting, verification of AWD practice, nutrient
                management, crop protection and correct application of biologicals.
              </motion.p>
              <motion.p variants={vFadeUp}>
                <strong style={{ color: C.ink }}>Village-level meetings.</strong> Held four times in the project period,
                with live demonstrations of AWD pipe installation, biological application and residue management.
                Biological-team members joined every VLM and leaflets were distributed.
              </motion.p>
              <motion.p variants={vFadeUp}>
                <strong style={{ color: C.ink }}>Always-on channels.</strong> Vernacular video on Grow Indigo's YouTube
                learning platform plus weekly WhatsApp messages in Telugu - including pest advisories naming the Kisan
                Advisor to call.
              </motion.p>
            </Stagger>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.08} className="mt-6">
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
   10 · EIGHT BENEFITS OF AWD  +  the pinned statement
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

function BenefitTile({ title, color, points }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      className="benefit-tile p-6 rounded-lg h-full"
      style={{ border: "1px solid rgba(255,255,255,.12)" }}
      animate={{ backgroundColor: open ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.05)" }}
      onHoverStart={() => setOpen(true)}
      onHoverEnd={() => setOpen(false)}
      onTap={() => setOpen((v) => !v)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className="flex items-center gap-3">
        <motion.span
          style={{ width: 10, height: 10, borderRadius: 99, background: color, display: "inline-block" }}
          animate={{ scale: open ? 1.6 : 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 18 }}
        />
        <h4 className="ch-display text-lg" style={{ color: "#fff", fontWeight: 700 }}>{title}</h4>
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.62)", marginTop: 10 }}>{points[0]}</div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <motion.ul className="mt-3 space-y-2" variants={vStagger(0.05, 0.05)} initial="hidden" animate="show">
              {points.slice(1).map((p) => (
                <motion.li key={p} variants={vFadeUp} className="flex gap-2.5" style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.72)" }}>
                  <span style={{ color }}>■</span>
                  <span>{p}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const BIG_PICTURE =
  "AWD is a single practice with cascading positive impacts - saving water, reducing emissions, improving soils, protecting biodiversity, cutting energy costs, safeguarding health and strengthening community water governance.";

/** The one pinned moment on the page. The section holds while the sentence
 *  resolves word by word against the scrollbar, then releases. Pinning is
 *  desktop-only; small screens get a plain staggered reveal instead. */
function PinnedStatement() {
  const scope = useGsapContext((self, el) => {
    const words = el.querySelectorAll(".pin-word");
    gsap.matchMedia().add(
      {
        desktop: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        compact: "(max-width: 1023px), (prefers-reduced-motion: reduce)",
      },
      (ctx) => {
        if (ctx.conditions.desktop) {
          gsap
            .timeline({
              scrollTrigger: { trigger: el, start: "top top", end: "+=110%", pin: true, scrub: 0.5, anticipatePin: 1 },
            })
            .fromTo(words, { opacity: 0.14, filter: "blur(1px)" },
              { opacity: 1, filter: "blur(0px)", stagger: 0.08, ease: "none" });
        } else {
          gsap.fromTo(words, { opacity: 0.2 },
            { opacity: 1, stagger: 0.03, duration: 0.5, scrollTrigger: { trigger: el, start: "top 80%", once: true } });
        }
      }
    );
  }, []);

  return (
    <div ref={scope} className="flex items-center justify-center px-5" style={{ minHeight: "70vh", background: C.field }}>
      <div className="mx-auto text-center" style={{ maxWidth: 900 }}>
        <Eyebrow color={C.husk}>The big picture</Eyebrow>
        <p className="ch-display mt-6" style={{ color: "#fff", fontWeight: 600, fontSize: "clamp(1.5rem,3.4vw,2.6rem)", lineHeight: 1.28 }}>
          {BIG_PICTURE.split(" ").map((w, i) => (
            <span key={i} className="pin-word" style={{ display: "inline-block", marginRight: "0.28em" }}>{w}</span>
          ))}
        </p>
      </div>
    </div>
  );
}

function BenefitsSection() {
  const grid = useBatchReveal(".benefit-tile", { stagger: 0.06 });
  return (
    <>
      <Section id="benefits" tone="dark">
        <SectionHead
          index="08"
          tone="dark"
          title="One practice, eight kinds of return"
          lede="AWD is a climate-smart, water-saving rice cultivation practice that delivers measurable environmental, agronomic, economic and social benefits - from an individual field to an entire watershed. Hover a tile to open the full evidence."
        />
        <div ref={grid} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AWD_BENEFITS.map(([t, c, p]) => <BenefitTile key={t} title={t} color={c} points={p} />)}
        </div>
      </Section>
      <PinnedStatement />
    </>
  );
}

/* ----------------------------------------------------------------------------
   11 · RESULTS - Recharts, mounted on viewport entry so their own draw
   animation doubles as the scroll reveal. Tooltips animate through framer.
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
  return (
    <AnimatePresence>
      {active && payload && payload.length && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="rounded p-3"
          style={{ background: C.ink, maxWidth: 260, boxShadow: "0 20px 40px -24px rgba(0,0,0,.6)" }}
        >
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{payload[0].payload.name}</div>
          <div className="ch-display" style={{ color: payload[0].payload.fill, fontWeight: 800, fontSize: 22, marginTop: 2 }}>
            {payload[0].payload.value.toLocaleString("en-IN")}{" "}
            <span style={{ fontSize: 11, fontWeight: 500 }}>{unit}</span>
          </div>
          <div className="ch-data" style={{ color: "rgba(255,255,255,.62)", fontSize: 10.5, lineHeight: 1.6, marginTop: 6 }}>
            {payload[0].payload.note}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChartFrame({ title, unit, kicker, children, height = 320, footnote }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  return (
    <motion.div
      ref={ref}
      className="p-6 md:p-7 rounded-lg h-full"
      style={{ background: "#fff", border: `1px solid ${C.line}` }}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: EASE }}
      whileHover={{ boxShadow: "0 24px 48px -32px rgba(10,31,22,.5)" }}
    >
      <Eyebrow>{kicker}</Eyebrow>
      <h4 className="ch-display mt-3 text-xl md:text-2xl" style={{ color: C.field, fontWeight: 700 }}>{title}</h4>
      <div className="ch-data mt-1" style={{ fontSize: 11, color: C.mute }}>{unit}</div>
      <div style={{ height, marginTop: 18 }}>
        {inView && <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
      </div>
      {footnote && (
        <div className="ch-data mt-3 pt-3" style={{ fontSize: 10.5, color: C.mute, lineHeight: 1.6, borderTop: `1px solid ${C.line}` }}>
          {footnote}
        </div>
      )}
    </motion.div>
  );
}

const axisStyle = { fontSize: 11, fill: C.mute, fontFamily: FONT_DATA };

function ResultsSection() {
  return (
    <Section id="results" tone="tint">
      <SectionHead
        index="09"
        title="Quantified, sampled, audited"
        lede="Grow Indigo started the season with 419 farmers; procurement completed for 249, and the square-root sampling method selected 16 of them for measurement. GHG quantification ran post-harvest on the Cool Farm Platform V3.0 and was reviewed by a third-party auditor."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame
          kicker="Chart 1 · Emissions intensity"
          title="Half the carbon in every tonne"
          unit="kg CO₂e per MT of paddy"
          footnote="Two project figures are shown because quantification runs with and without the nursery stage. The headline 51% uses the corrected nursery emission of 24.54 kg CO₂e/MT."
        >
          <BarChart data={EMISSIONS} margin={{ top: 10, right: 10, left: -12, bottom: 34 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
            <XAxis dataKey="name" tick={axisStyle} interval={0} angle={-12} textAnchor="end" height={54} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 1400]} />
            <Tooltip content={<ChartTip unit="kg CO₂e/MT" />} cursor={{ fill: "rgba(14,91,51,.06)" }} />
            <ReferenceLine y={1325} stroke={C.husk} strokeDasharray="4 4" />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1400} animationEasing="ease-out">
              {EMISSIONS.map((e) => <Cell key={e.name} fill={e.fill} />)}
              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ChartFrame>

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
            <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1400} animationBegin={200}>
              {NITROGEN.map((e) => <Cell key={e.name} fill={e.fill} />)}
              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ChartFrame>

        <ChartFrame
          kicker="Supporting indicator"
          title="Water per kilogram of paddy"
          unit="litres per kg"
          height={230}
          footnote="Baseline of ~3,250 litres/kg; the project figure is derived from the ~45% saving reported for AWD adoption."
        >
          <BarChart data={WATER} layout="vertical" margin={{ top: 4, right: 44, left: 96, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} horizontal={false} />
            <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 3600]} />
            <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={92} />
            <Tooltip content={<ChartTip unit="litres/kg" />} cursor={{ fill: "rgba(30,136,168,.07)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30} animationDuration={1400}>
              {WATER.map((e) => <Cell key={e.name} fill={e.fill} />)}
              <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ChartFrame>

        <ChartFrame
          kicker="Supporting indicator"
          title="Yield, season on season"
          unit="MT per acre, average"
          height={230}
          footnote="A ~7.4% decline attributed to seasonal factors - irregular monsoon distribution, untimely rainfall, temporary water stress, high temperatures at flowering or grain filling, cloudy weather and lodging - alongside agronomic variation in transplanting dates, varietal performance, pest pressure, weed competition, nutrient timing and soil fertility."
        >
          <LineChart data={YIELD} margin={{ top: 16, right: 24, left: -18, bottom: 8 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
            <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[2, 3]} />
            <Tooltip content={<ChartTip unit="MT" />} />
            <Line type="linear" dataKey="value" stroke={C.husk} strokeWidth={2.5} dot={{ r: 5, fill: C.husk, strokeWidth: 0 }} activeDot={{ r: 7 }} animationDuration={1400}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: FONT_DATA, fill: C.ink, fontWeight: 600 }} />
            </Line>
          </LineChart>
        </ChartFrame>
      </div>

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
            <Stagger className="mt-5 grid grid-cols-3 gap-3" stagger={0.1}>
              {[["36.80", "gross nursery"], ["24.54", "after correction"], ["679.13", "net reduction"]].map(([v, l]) => (
                <motion.div key={l} variants={vScaleIn} whileHover={{ y: -4 }} className="p-3 rounded" style={{ background: C.paperDim }}>
                  <div className="ch-display" style={{ fontWeight: 800, color: C.field, fontSize: "1.35rem" }}>{v}</div>
                  <div className="ch-data" style={{ fontSize: 9.5, color: C.mute, marginTop: 2 }}>{l} · kg CO₂e/MT</div>
                </motion.div>
              ))}
            </Stagger>
          </div>
        </Reveal>
        <Reveal delay={0.11}>
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
   12 · THE SEASON - activity timeline + critical stages
   Gantt bars grow from the left on a staggered GSAP timeline; hovering a bar
   swaps the caption line through AnimatePresence.
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

const STAGES = [
  ["Tillering", "For effective tiller production", "Reduction in effective tillers leads to yield loss"],
  ["Panicle to flowering", "For fertile grain formation", "More sterile grains - yield loss"],
  ["Milking to dough", "For complete grain filling", "Less head rice, more broken rice"],
];

function Timeline() {
  const [tip, setTip] = useState(null);
  const scope = useGsapContext((self, el) => {
    gsap.fromTo(
      el.querySelectorAll(".gantt-bar"),
      { scaleX: 0, opacity: 0, transformOrigin: "left center" },
      {
        scaleX: 1, opacity: 1, duration: 0.8, ease: GSAP_EASE,
        stagger: { each: 0.05, grid: "auto", from: "start" },
        scrollTrigger: { trigger: el, start: "top 78%", once: true },
      }
    );
    gsap.from(el.querySelectorAll(".gantt-row-label"), {
      x: -18, autoAlpha: 0, duration: 0.6, ease: GSAP_EASE, stagger: 0.06,
      scrollTrigger: { trigger: el, start: "top 78%", once: true },
    });
  }, []);

  return (
    <div ref={scope} className="p-5 md:p-7 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <div className="ch-scroll" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          {TIMELINE.map(([label, color, bars]) => (
            <div key={label} className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <div
                className="gantt-row-label ch-data px-3 py-2 rounded"
                style={{ width: 168, flexShrink: 0, fontSize: 10.5, fontWeight: 600, background: color, color: "#fff", lineHeight: 1.35 }}
              >
                {label}
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${MONTHS.length}, 1fr)`, gap: 3 }}>
                {bars.map(([t, start, span, detail]) => (
                  <motion.div
                    key={t}
                    className="gantt-bar ch-data px-2 py-2 rounded"
                    onHoverStart={() => setTip(`${t} - ${detail}`)}
                    onHoverEnd={() => setTip(null)}
                    whileHover={{ filter: "brightness(1.18)", scaleY: 1.15 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    style={{
                      gridColumn: `${start} / span ${span}`,
                      background: color, color: "#fff", fontSize: 10, fontWeight: 500,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "help",
                    }}
                  >
                    {t}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-3" style={{ marginTop: 10 }}>
            <div style={{ width: 168, flexShrink: 0 }} />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${MONTHS.length}, 1fr)`, gap: 3 }}>
              {MONTHS.map((m) => (
                <div key={m} className="ch-data text-center" style={{ fontSize: 11, color: C.mute, fontWeight: 600 }}>{m}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ch-data mt-4 pt-3" style={{ fontSize: 11, borderTop: `1px solid ${C.line}`, minHeight: 34, lineHeight: 1.6 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={tip || "idle"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, color: tip ? C.field : C.mute }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ display: "inline-block" }}
          >
            {tip || "HOVER ANY BAR FOR THE OPERATIONAL DETAIL"}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SeasonSection() {
  return (
    <Section id="season">
      <SectionHead
        index="10"
        title="A season, operation by operation"
        lede="The rice production cycle ran from nursery establishment through transplanting to harvest, with a structured sequence of agronomic operations, regenerative interventions and nutrient applications timed to crop stage."
      />
      <Reveal><Timeline /></Reveal>

      <div className="grid gap-6 lg:grid-cols-2 mt-10">
        <Stagger className="space-y-4" stagger={0.1} style={{ fontSize: 14.5, lineHeight: 1.75, color: C.mute }}>
          <motion.p variants={vFadeUp}>
            Seedlings were transplanted mid-season and, within the first three days, farmers applied a post-emergence
            herbicide - Bispyribac Sodium 10SC, or Fenoxaprop-p-ethyl 6.7EC + Metsulfuron Methyl 10WP + Chlorimuron
            Ethyl 10WP - for early weed suppression. Between 10–15 days after transplanting, AWD field pipes were
            installed across all project plots and manual water-level measurement began.
          </motion.p>
          <motion.p variants={vFadeUp}>
            At ~15 DAT (tillering), farmers applied the first split of urea and DAP alongside 6 kg/acre of Oorjit
            granules and 20 kg of Grow Phos, with support from Grow Indigo's field team. Around ~55 DAT a second
            herbicide went on where weed pressure required it. The second urea split followed at ~65 DAT (panicle
            initiation), typically with fungicide and insecticide; the third and final split at ~75 DAT supported grain
            development.
          </motion.p>
          <motion.p variants={vFadeUp}>
            Post-harvest activity began at crop maturity. Procurement and traceability documentation were completed
            soon after harvest, with GHG quantification and report submission following.
          </motion.p>
        </Stagger>

        <Reveal delay={0.11}>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
            <div className="px-6 py-4" style={{ background: C.field }}>
              <Eyebrow color="rgba(255,255,255,.7)">Critical crop stages for AWD management</Eyebrow>
            </div>
            {STAGES.map(([stage, why, risk], i) => (
              <motion.div
                key={stage}
                className="px-6 py-5"
                style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}
                whileHover={{ backgroundColor: "rgba(14,91,51,.035)", x: 3 }}
                transition={{ duration: 0.25 }}
              >
                <div style={{ fontWeight: 600, color: C.field, fontSize: 15 }}>{stage}</div>
                <div className="mt-1.5" style={{ fontSize: 13.5, color: C.ink }}>{why}</div>
                <div className="ch-data mt-2 flex gap-2" style={{ fontSize: 11, color: C.clay, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600 }}>RISK IF MISSED</span>
                  <span style={{ color: C.mute }}>{risk}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   13 · ECONOMICS FOR FARMERS
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
        <Stagger className="mt-6 space-y-5" stagger={0.09}>
          {items.map(([k, v]) => (
            <motion.div key={k} variants={vFadeUp} className="flex gap-3" whileHover={{ x: 5 }} transition={{ duration: 0.25, ease: EASE }}>
              <motion.span
                style={{ color: accent, fontWeight: 700, lineHeight: 1.5 }}
                whileHover={{ scale: 1.3 }}
              >
                ✓
              </motion.span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink }}>{k}</div>
                <div className="mt-1" style={{ fontSize: 13.5, lineHeight: 1.65, color: C.mute }}>{v}</div>
              </div>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </Reveal>
  );
  return (
    <Section id="economics" tone="tint">
      <SectionHead
        index="11"
        title="What it meant for the farmer"
        lede="The project strengthened farm economics through immediate cost savings and longer-term productivity gains from regenerative practice."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {col("Short-term impact", SHORT_TERM, C.husk, 0)}
        {col("Long-term impact", LONG_TERM, C.field, 0.11)}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   14 · ALIGNMENT WITH ABC RESPONSIBLE SOURCING
   Hovering a lever moves a shared layoutId highlight onto its pillar, so the
   mapping is demonstrated by the motion rather than asserted by an arrow.
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
        index="12"
        tone="dark"
        title="Mapped to ABC's Responsible Sourcing Standard"
        lede="The standard sets out how the supply chain is expected to operate - environmental performance, human-rights protection, traceability and farmer livelihoods. Every intervention deployed in Nizamabad maps onto a pillar, and every metric here supports ABC's Scope 3 and ESG disclosure obligations."
      />
      <LayoutGroup id="sourcing">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <Eyebrow color="rgba(255,255,255,.5)">Project levers</Eyebrow>
            <Stagger className="mt-4 space-y-3" stagger={0.08}>
              {LEVERS.map(([name, sub, target], i) => {
                const on = active === i;
                return (
                  <motion.div
                    key={name}
                    variants={vFadeUp}
                    tabIndex={0}
                    onHoverStart={() => setActive(i)}
                    onHoverEnd={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    onTap={() => setActive(on ? null : i)}
                    animate={{
                      opacity: active === null || on ? 1 : 0.4,
                      x: on ? 8 : 0,
                      backgroundColor: on ? "#ffffff" : "rgba(255,255,255,.06)",
                      borderColor: on ? "#ffffff" : "rgba(255,255,255,.14)",
                    }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="p-5 rounded"
                    style={{ border: "1px solid", cursor: "pointer" }}
                  >
                    <motion.div animate={{ color: on ? C.ink : "#fff" }} style={{ fontWeight: 600, fontSize: 15 }}>{name}</motion.div>
                    <motion.div className="ch-data mt-1" animate={{ color: on ? C.mute : "rgba(255,255,255,.55)" }} style={{ fontSize: 11 }}>{sub}</motion.div>
                    <div className="ch-data mt-2" style={{ fontSize: 10, color: PILLARS[target][3], letterSpacing: ".1em" }}>
                      → {PILLARS[target][0].toUpperCase()}
                    </div>
                  </motion.div>
                );
              })}
            </Stagger>
          </Reveal>

          <Reveal delay={0.11}>
            <Eyebrow color="rgba(255,255,255,.5)">Responsible sourcing pillars</Eyebrow>
            <Stagger className="mt-4 space-y-3" stagger={0.08}>
              {PILLARS.map(([code, name, contribution, color], i) => {
                const linked = active !== null && LEVERS[active][2] === i;
                return (
                  <motion.div
                    key={code}
                    variants={vFadeUp}
                    className="relative p-5 rounded"
                    animate={{ opacity: active === null || linked ? 1 : 0.35, scale: linked ? 1.02 : 1 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    style={{ border: `1px solid ${linked ? color : "rgba(255,255,255,.14)"}`, background: "rgba(255,255,255,.06)" }}
                  >
                    {linked && (
                      <motion.span
                        layoutId="pillar-fill"
                        className="absolute inset-0 rounded"
                        style={{ background: color }}
                        transition={{ type: "spring", stiffness: 300, damping: 34 }}
                      />
                    )}
                    <div className="relative">
                      <div className="ch-data" style={{ fontSize: 10, letterSpacing: ".14em", color: linked ? "rgba(255,255,255,.85)" : color, fontWeight: 600 }}>
                        {code.toUpperCase()}
                      </div>
                      <div className="mt-1" style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>{name}</div>
                      <motion.div className="mt-2" animate={{ color: linked ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.55)" }} style={{ fontSize: 13, lineHeight: 1.65 }}>
                        {contribution}
                      </motion.div>
                    </div>
                  </motion.div>
                );
              })}
            </Stagger>
          </Reveal>
        </div>
      </LayoutGroup>

      <Reveal delay={0.12} className="mt-10">
        <div className="p-7 md:p-9 rounded-lg" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)" }}>
          <Eyebrow color={C.husk}>Insight</Eyebrow>
          <Stagger className="mt-5 grid gap-6 md:grid-cols-3" stagger={0.12} style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,.75)" }}>
            <motion.p variants={vFadeUp}>
              AWD alone delivers eight distinct ESG benefits. That breadth lets ABC communicate the work credibly
              across climate, water, biodiversity and rural-development pillars - without overstating any single claim,
              and while staying inside the bounds of the field evidence.
            </motion.p>
            <motion.p variants={vFadeUp}>
              Geo-tagged field boundaries, farmer-diary practice records, scientific QC and Cool Farm Platform
              quantification together produce emission reductions that are field-attributable and third-party
              verifiable - the quality threshold for Scope 3 insetting claims under emerging GHG Protocol and SBTi
              guidance.
            </motion.p>
            <motion.p variants={vFadeUp}>
              The programme is a working template for how Responsible Sourcing commitments translate into measurable,
              defensible field outcomes - providing both the operational learnings and the disclosure evidence needed
              to scale climate-aligned procurement across the rice category, and beyond.
            </motion.p>
          </Stagger>
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   15 · FIELD EVIDENCE (Annexures 1–10)
   Cards reveal in batched rows; the geotag stamp lifts in on hover. Swap
   <EvidenceScene/> for an <img src> and the stamp still sits correctly.
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
  const grid = useBatchReveal(".evi-card", { stagger: 0.07 });
  return (
    <Section id="evidence">
      <SectionHead
        index="13"
        title="Field evidence"
        lede="The annexures below document field-level evidence, monitoring data and operational records collected throughout the project period - each one geo-tagged and dated at the point of capture."
      />
      <div ref={grid} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EVIDENCE.map((e) => (
          <motion.div
            key={e.n}
            className="evi-card rounded-lg overflow-hidden h-full"
            style={{ background: "#fff", border: `1px solid ${C.line}` }}
            transition={{ duration: 0.35, ease: EASE }}
            initial="rest"
            animate="rest"
            whileHover="hov"
            variants={{ rest: { y: 0 }, hov: { y: -6 } }}
          >
              <div className="relative overflow-hidden">
                <motion.div variants={{ rest: { scale: 1 }, hov: { scale: 1.06 } }} transition={{ duration: 0.6, ease: EASE }}>
                  <EvidenceScene kind={e.scene} />
                </motion.div>
                <motion.div
                  className="absolute left-0 right-0 bottom-0 px-3 py-2"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,.78))" }}
                  variants={{ rest: { y: 0 }, hov: { y: -2 } }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <GeoStamp place={e.place} coords={e.coords} when={e.when} />
                </motion.div>
              </div>
              <div className="p-5">
                <Eyebrow>Annexure {e.n}</Eyebrow>
                <div className="mt-2" style={{ fontWeight: 600, fontSize: 15, color: C.field }}>{e.title}</div>
              <p className="mt-2" style={{ fontSize: 13, lineHeight: 1.65, color: C.mute }}>{e.caption}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   16 · PHOTO PLACEHOLDER
   Every image slot on the page is one component, so dropping the real
   photography in later is a single find-and-replace: give <PhotoSlot> a `src`
   and it renders the image instead of the frame, keeping the geotag bar,
   aspect ratio and hover behaviour identical.
---------------------------------------------------------------------------- */
function PhotoSlot({ label, ratio = "4 / 3", stamp, src, alt, className = "", tall = false }) {
  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{ aspectRatio: tall ? "3 / 4" : ratio, background: C.paperDim, border: `1px dashed ${C.line}` }}
    >
      {src ? (
        <img src={src} alt={alt || label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="1.4" opacity="0.65">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.6" />
            <path d="M21 16l-5-5-6 6-3-3-4 4" />
          </svg>
          <div className="ch-data" style={{ fontSize: 10, color: C.mute, letterSpacing: ".1em", lineHeight: 1.6 }}>
            {label.toUpperCase()}
          </div>
        </div>
      )}
      {stamp && (
        <div className="absolute left-0 right-0 bottom-0 px-3 py-2" style={{ background: "linear-gradient(transparent, rgba(0,0,0,.78))" }}>
          <GeoStamp place={stamp.place} coords={stamp.coords} when={stamp.when} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   17 · SEQUENCE OF EVENTS
   The operational spine of the programme, kick-off to reporting. The rail
   draws itself against the scrollbar (scrubbed ScrollTrigger) and each node
   pops as the rail reaches it, so the reader watches the season assemble.
---------------------------------------------------------------------------- */
const SEQUENCE = [
  {
    n: "01", title: "Programme kick-off", tag: "Mobilisation", color: C.field,
    body: "ClearHarvest and Grow Indigo aligned on scope, geography and reporting obligations, then stood up the delivery team - PMU, RBM/Agronomist, TBM and the Kisan Advisors who would carry the programme village to village.",
    meta: "Varni & Chandur blocks · 23 villages identified",
  },
  {
    n: "02", title: "First village-level meeting", tag: "VLM 1", color: C.water,
    body: "Farmers were introduced to the programme in their own villages: what AWD is, why continuous flooding drives methane, and what taking part would and would not require of them. Enrolment was voluntary throughout.",
    meta: "Telugu-language sessions · leaflets distributed",
  },
  {
    n: "03", title: "Distribution of biologicals", tag: "Inputs", color: C.leaf,
    body: "Every enrolled farmer received a 6 kg bag of Oorjit granules and a 20 kg bag of Grow Phos - one acre's worth - free of cost, alongside an AWD field pipe. Each handover was photographed and logged against the farmer's record.",
    meta: "6 kg Oorjit + 20 kg Grow Phos + 1 AWD pipe per acre",
  },
  {
    n: "04", title: "Second village-level meeting", tag: "VLM 2", color: C.water,
    body: "A working session rather than an introduction: live demonstration of AWD pipe installation, correct placement in the bund, and how to read the fall in water depth. Biological-team members walked through application timing.",
    meta: "Hands-on demonstration · pipe installation",
  },
  {
    n: "05", title: "Consent letter signing", tag: "Governance", color: C.clay,
    body: "Farmers signed written consent covering participation, field data capture and use of their geo-tagged boundary in programme reporting. Consent is what makes the traceability claim defensible - and it stayed revocable.",
    meta: "Signed consent retained in the audit pack",
  },
  {
    n: "06", title: "Third village-level meeting", tag: "VLM 3", color: C.water,
    body: "Mid-season review at crop stage: nutrient splits, weed and pest pressure, and troubleshooting for farmers whose fields were drying faster or slower than the schedule expected.",
    meta: "Crop-stage review · nutrient split guidance",
  },
  {
    n: "07", title: "Fourth village-level meeting", tag: "VLM 4", color: C.water,
    body: "Pre-harvest planning: residue handling, baling logistics, and what would be required at procurement. Farmers who had not previously baled were connected to balers and to local gaushalas as buyers.",
    meta: "Residue planning · procurement briefing",
  },
  {
    n: "08", title: "Regular water-level monitoring", tag: "Continuous", color: C.waterDeep,
    body: "The spine of the whole intervention. Kisan Advisors measured water depth in the AWD tube through the season and farmers maintained dated diaries - irrigation date, method, source and re-irrigation interval for every single event.",
    meta: "Manual measurement · farmer diaries · FieldKhata",
  },
  {
    n: "09", title: "Delivery to Aishwarya Rice Mills", tag: "Procurement", color: C.husk,
    body: "Low-emission paddy moved from farm to ABC's empanelled miller under a documented chain: weighbridge slip, Form of Certificate (X) countersigned by the village officer, and the miller's payment voucher - all captured in S3 Sutra.",
    meta: "Farm-to-mill audit trail in S3 Sutra",
  },
  {
    n: "10", title: "Residue baled, not burnt", tag: "CRM", color: C.husk,
    body: "Farmers baled and bundled paddy straw immediately after harvest instead of burning it, then sold it to nearby cowsheds and gaushalas. 600 acres were baled against an original target of 300 - a 100% overshoot.",
    meta: "600 acres baled · zero open field burning",
  },
  {
    n: "11", title: "Third-party audit", tag: "Assurance", color: C.field,
    body: "One Peterson independently reviewed the field evidence and digital records - geo-tagged boundaries, farmer diaries, practice verification and the procurement trail - testing whether the reductions claimed are attributable to the fields that produced them.",
    meta: "Independent verification · One Peterson",
  },
  {
    n: "12", title: "Quantification & reporting", tag: "Delivery", color: C.leaf,
    body: "Grow Indigo quantified emissions on the Cool Farm Platform V3.0 using the square-root sample, then compiled this report: 679.13 kg CO₂e/MT reduced, 51% against ABC's baseline, with the methodology and its caveats stated in full.",
    meta: "Cool Farm Platform V3.0 · 16 farmers sampled",
  },
];

function SequenceNode({ item, i }) {
  const flip = i % 2 === 1;
  return (
    <div className="seq-node relative grid gap-4 md:gap-8 md:grid-cols-2 items-center" style={{ marginBottom: 34 }}>
      {/* card */}
      <motion.div
        className={flip ? "md:col-start-2" : "md:col-start-1 md:text-right"}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <div className="p-6 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: flip ? `3px solid ${item.color}` : undefined, borderRight: flip ? undefined : `3px solid ${item.color}` }}>
          <div className={`flex items-center gap-3 ${flip ? "" : "md:justify-end"}`}>
            <Eyebrow color={item.color}>{item.tag}</Eyebrow>
          </div>
          <h4 className="ch-display mt-3 text-xl" style={{ color: C.field, fontWeight: 700 }}>{item.title}</h4>
          <p className="mt-3" style={{ fontSize: 13.5, lineHeight: 1.7, color: C.mute }}>{item.body}</p>
          <div className="ch-data mt-4 pt-3" style={{ fontSize: 10.5, color: item.color, lineHeight: 1.6, borderTop: `1px solid ${C.line}` }}>
            {item.meta.toUpperCase()}
          </div>
        </div>
      </motion.div>

      {/* photo slot opposite the card */}
      <div className={flip ? "md:col-start-1 md:row-start-1" : "md:col-start-2"}>
        <PhotoSlot label={`Photo · ${item.title}`} ratio="16 / 10" />
      </div>

      {/* the node marker on the rail */}
      <div className="seq-dot absolute hidden md:flex items-center justify-center" style={{ left: "50%", transform: "translateX(-50%)", top: "50%", marginTop: -18 }}>
        <span style={{ width: 36, height: 36, borderRadius: 99, background: item.color, display: "grid", placeItems: "center", border: `3px solid ${C.paper}` }}>
          <span className="ch-data" style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{item.n}</span>
        </span>
      </div>
    </div>
  );
}

function SequenceSection() {
  const scope = useGsapContext((self, el) => {
    const rail = el.querySelector(".seq-rail-fill");
    const dots = el.querySelectorAll(".seq-dot");
    const cards = el.querySelectorAll(".seq-node");

    gsap.matchMedia().add(
      { ok: "(min-width: 768px) and (prefers-reduced-motion: no-preference)" },
      () => {
        // rail fills against the scrollbar
        gsap.fromTo(rail, { scaleY: 0 }, {
          scaleY: 1, ease: "none", transformOrigin: "top center",
          scrollTrigger: { trigger: el, start: "top 62%", end: "bottom 78%", scrub: 0.4 },
        });
        // each node pops as the rail reaches it
        dots.forEach((d) => {
          gsap.fromTo(d, { scale: 0, opacity: 0 }, {
            scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)",
            scrollTrigger: { trigger: d, start: "top 68%", once: true },
          });
        });
      }
    );

    // cards alternate their entry direction
    cards.forEach((c, i) => {
      gsap.fromTo(c, { autoAlpha: 0, x: i % 2 ? 40 : -40 }, {
        autoAlpha: 1, x: 0, duration: 0.8, ease: GSAP_EASE,
        scrollTrigger: { trigger: c, start: "top 82%", once: true },
      });
    });
  }, []);

  return (
    <Section id="sequence" tone="tint">
      <SectionHead
        index="05"
        title="How the season ran, start to finish"
        lede="Twelve steps from kick-off to audited report. Each one produced a record - a photograph, a signed form, a diary entry or a digital log - and those records are what the quantification ultimately rests on."
      />
      <div ref={scope} className="relative">
        {/* the rail */}
        <div className="absolute hidden md:block" style={{ left: "50%", top: 0, bottom: 0, width: 2, transform: "translateX(-50%)", background: C.line }}>
          <div className="seq-rail-fill" style={{ width: 2, height: "100%", background: C.field, transformOrigin: "top center" }} />
        </div>
        {SEQUENCE.map((s, i) => <SequenceNode key={s.n} item={s} i={i} />)}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   18 · FARMER TESTIMONIALS
   Recorded in Telugu. The English translation sits in a subtitle bar pinned to
   the bottom of the frame - the same place a burned-in subtitle would land -
   so it reads as part of the video, not as a caption underneath it.

   ⟵ DROP-IN: give each entry a `src` (mp4/webm) or `poster`. The <video>
   branch is already wired; add a <track kind="subtitles" srcLang="te"> pointing
   at a WebVTT file if you want native, seekable captions as well.
---------------------------------------------------------------------------- */
const TESTIMONIALS = [
  {
    id: "t1",
    farmer: "Kolluri Gangaram",
    village: "Ghanpur",
    acres: "9.1 acres",
    te: "నీటి పైపు వాడటం వల్ల ఎప్పుడు నీరు పెట్టాలో స్పష్టంగా తెలుస్తుంది. కరెంటు ఖర్చు తగ్గింది.",
    en: "With the water pipe I can see exactly when the field needs irrigating. My electricity cost has come down.",
    src: null,
  },
  {
    id: "t2",
    farmer: "Mekala Narsimha",
    village: "Kunipoor",
    acres: "6.4 acres",
    te: "గ్రో ఫాస్ మరియు ఊర్జిత్ బాగా పనిచేశాయి. యూరియా తక్కువ వాడినా పంట బాగుంది.",
    en: "Grow Phos and Oorjit worked well. Even with less urea, the crop was good.",
    src: null,
  },
  {
    id: "t3",
    farmer: "Bandari Ashok",
    village: "Srinagar",
    acres: "11.2 acres",
    te: "గడ్డిని కాల్చకుండా బేల్ చేసి గోశాలకు అమ్మాము. పొలం శుభ్రంగా ఉంది, కొంత ఆదాయం కూడా వచ్చింది.",
    en: "Instead of burning the straw we baled it and sold it to the gaushala. The field stayed clean and we earned something too.",
    src: null,
  },
];

function TestimonialCard({ t, index }) {
  const [playing, setPlaying] = useState(false);
  return (
    <motion.div
      className="testi-card rounded-lg overflow-hidden h-full"
      style={{ background: "#fff", border: `1px solid ${C.line}` }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className="relative" style={{ aspectRatio: "4 / 3", background: C.ink }}>
        {t.src ? (
          <video
            src={t.src}
            controls
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <motion.button
              onClick={() => setPlaying((v) => !v)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              style={{ width: 58, height: 58, borderRadius: 99, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.28)", display: "grid", placeItems: "center" }}
              aria-label={`Play testimonial from ${t.farmer}`}
            >
              <svg width="18" height="20" viewBox="0 0 18 20" fill="#fff"><path d="M0 0l18 10L0 20z" /></svg>
            </motion.button>
            <div className="ch-data" style={{ fontSize: 9.5, color: "rgba(255,255,255,.45)", letterSpacing: ".12em" }}>
              VIDEO PLACEHOLDER
            </div>
          </div>
        )}

        {/* language chip */}
        <div className="absolute top-3 left-3 ch-data px-2 py-1 rounded" style={{ fontSize: 9, letterSpacing: ".1em", background: "rgba(0,0,0,.55)", color: "#fff" }}>
          TELUGU · తెలుగు
        </div>

        {/* burned-in subtitle bar: Telugu source above, English translation below */}
        <div className="absolute left-0 right-0 bottom-0 px-4 pt-8 pb-3" style={{ background: "linear-gradient(transparent, rgba(0,0,0,.9))" }}>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)", lineHeight: 1.55 }}>{t.te}</div>
          <div className="mt-1.5" style={{ fontSize: 13.5, color: "#fff", fontWeight: 500, lineHeight: 1.5 }}>{t.en}</div>
        </div>
      </div>

      <div className="p-5 flex items-center justify-between gap-3">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.field }}>{t.farmer}</div>
          <div className="ch-data mt-1" style={{ fontSize: 10.5, color: C.mute }}>
            {t.village.toUpperCase()} · {t.acres.toUpperCase()}
          </div>
        </div>
        <div className="ch-data" style={{ fontSize: 26, color: C.paperDim, fontWeight: 600, lineHeight: 1 }}>
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
    </motion.div>
  );
}

function TestimonialsSection() {
  const grid = useBatchReveal(".testi-card", { stagger: 0.1 });
  return (
    <Section id="testimonials">
      <SectionHead
        index="06"
        title="In the farmers' words"
        lede="Recorded on-field in Telugu during the season. English translation runs in the subtitle bar so the original stays first and the translation supports it, rather than replacing it."
      />
      <div ref={grid} className="grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => <TestimonialCard key={t.id} t={t} index={i} />)}
      </div>
      <Reveal delay={0.1} className="mt-5">
        <div className="ch-data p-4 rounded" style={{ fontSize: 11, color: C.mute, background: C.paperDim, lineHeight: 1.7 }}>
          Translations were checked against the recordings by the field team. Where a farmer used a local term with no
          direct English equivalent, the subtitle keeps the sense rather than the literal words.
        </div>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   19 · FIELD PHOTOGRAPHY
   Three sets the programme documented continuously: village meetings, the
   biologicals handover, and the farmer diaries. Filter chips switch sets with
   a framer layout animation so the grid reflows instead of cutting.
---------------------------------------------------------------------------- */
const GALLERY = {
  vlm: {
    label: "Village-level meetings",
    blurb: "Four VLMs across the project period. Demonstrations on AWD pipe installation, Oorjit and Grow Phos application, and residue management - with biological-team members present at every session to answer product questions directly.",
    shots: [
      { label: "VLM in progress - Kunipoor", stamp: { place: "Kunipoor, Telangana, India", coords: "18.511113°N 77.940613°E", when: "Tue, 16/12/2025 10:27 AM" } },
      { label: "Field team presenting to farmers", stamp: { place: "Kunipoor, Telangana, India", coords: "18.511154°N 77.940617°E", when: "Tue, 16/12/2025 10:03 AM" } },
      { label: "AWD pipe demonstration", stamp: null },
      { label: "Leaflet distribution", stamp: null },
      { label: "Farmer Q&A session", stamp: null },
      { label: "Attendance register", stamp: null },
    ],
  },
  bio: {
    label: "Distribution of biologicals",
    blurb: "Each enrolled farmer received 6 kg of Oorjit granules and 20 kg of Grow Phos - adequate for one acre - plus an AWD field pipe, all free of cost. Every handover was photographed and logged against the farmer's record.",
    shots: [
      { label: "Oorjit and Grow Phos handover", stamp: { place: "Ghanpur, Telangana, India", coords: "18.57334°N 77.930693°E", when: "Thu, 18/12/2025 10:49 AM" } },
      { label: "Input bags at village collection point", stamp: null },
      { label: "AWD pipe distribution", stamp: null },
      { label: "Application training with farmer", stamp: null },
      { label: "Farmer receiving inputs", stamp: null },
      { label: "Stock verification by TBM", stamp: null },
    ],
  },
  diary: {
    label: "Farmer diaries",
    blurb: "A dated, handwritten water-management log kept by each farmer: irrigation date, plot ID, method, quantity, duration, water source and re-irrigation interval - alongside a socio-economic profile page. These are the primary records behind the water-saving assessment.",
    shots: [
      { label: "Socio-economic profile page", stamp: null, tall: true },
      { label: "Water management log - irrigation dates", stamp: null, tall: true },
      { label: "Re-irrigation interval entries", stamp: null, tall: true },
      { label: "Stakeholder feedback form", stamp: null, tall: true },
      { label: "Signed consent letter", stamp: null, tall: true },
      { label: "Procurement receipt", stamp: null, tall: true },
    ],
  },
};
const GALLERY_KEYS = Object.keys(GALLERY);

function PhotographySection() {
  const [set, setSet] = useState("vlm");
  const active = GALLERY[set];
  return (
    <Section id="photography" tone="tint">
      <SectionHead
        index="07"
        title="What the field team documented"
        lede="Photographic and paper evidence collected through the season, geo-tagged and dated at capture. These sit alongside the digital records in FieldKhata and S3 Sutra."
      />

      <LayoutGroup id="gallery">
        <div className="flex flex-wrap gap-2 mb-7">
          {GALLERY_KEYS.map((k) => (
            <motion.button
              key={k}
              onClick={() => setSet(k)}
              className="relative ch-data px-4 py-2 rounded"
              style={{ fontSize: 10.5, letterSpacing: ".08em", fontWeight: 600, color: set === k ? "#fff" : C.mute, border: `1px solid ${set === k ? C.field : C.line}` }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              {set === k && (
                <motion.span layoutId="gallery-pill" className="absolute inset-0 rounded" style={{ background: C.field }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
              <span className="relative">{GALLERY[k].label.toUpperCase()}</span>
            </motion.button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div
          key={set}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <p className="mb-6" style={{ fontSize: 14.5, lineHeight: 1.75, color: C.mute, maxWidth: "76ch" }}>{active.blurb}</p>
          <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={vStagger(0.06)} initial="hidden" animate="show">
            {active.shots.map((s) => (
              <motion.div key={s.label} variants={vFadeUp} whileHover={{ y: -4 }} transition={{ duration: 0.3, ease: EASE }}>
                <PhotoSlot label={s.label} stamp={s.stamp} tall={s.tall} />
                <div className="ch-data mt-2" style={{ fontSize: 10.5, color: C.mute, lineHeight: 1.5 }}>{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
   20 · LOGO LOCKUP
   Two mirrored slots: ClearHarvest left, Grow Indigo right - the same
   arrangement used on the source document's letterhead. Both are placeholders
   sized to a standard horizontal wordmark (roughly 3.6 : 1). Drop a file in
   via `src` and the frame disappears; the spacing does not move.
---------------------------------------------------------------------------- */
function LogoSlot({ name, src, align = "left", light = false, height = 34 }) {
  const fg = light ? "rgba(255,255,255,.55)" : C.mute;
  const edge = light ? "rgba(255,255,255,.22)" : C.line;
  return (
    <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {src ? (
        <img src={src} alt={`${name} logo`} style={{ height, width: "auto", display: "block" }} />
      ) : (
        <div
          className="flex items-center justify-center rounded"
          style={{ height, width: height * 3.6, border: `1px dashed ${edge}`, background: light ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.02)" }}
          aria-label={`${name} logo placeholder`}
        >
          <span className="ch-data" style={{ fontSize: 8.5, letterSpacing: ".12em", color: fg, textAlign: "center", lineHeight: 1.35 }}>
            {name.toUpperCase()}
            <br />LOGO
          </span>
        </div>
      )}
    </div>
  );
}

/** Mirrored pair with a hairline between - used at the top of the page and
 *  again in the footer, so the two marks bookend the report. */
function LogoLockup({ light = false, height = 34, rule = true }) {
  return (
    <div className="flex items-center gap-5 w-full">
      <LogoSlot name="ClearHarvest" align="left" light={light} height={height} />
      {rule && <span style={{ flex: 1, height: 1, background: light ? "rgba(255,255,255,.18)" : C.line }} />}
      <LogoSlot name="Grow Indigo" align="right" light={light} height={height} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   21 · CLOSING - bibliography, data notes, sign-off
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
  "Quantification also yields 703.68 kg CO₂e/MT (~53%) excluding nursery emissions and 666.87 kg CO₂e/MT (~50%) using gross nursery emissions - all three appear in Chart 1 rather than being collapsed into one number.",
  "Water use of ~1,788 litres/kg is derived from the ~45% saving against the stated ~3,250 litres/kg baseline.",
  "Farmer counts differ by stage: 419 enrolled, 309 fields mapped and geofenced, 249 completing procurement, of whom 16 were sampled for quantification.",
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
                <motion.li key={href} className="flex gap-4" whileHover={{ x: 4 }} transition={{ duration: 0.25 }}>
                  <span className="ch-data" style={{ color: C.husk, fontSize: 11, fontWeight: 600, paddingTop: 3 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.78)" }}>{cite}</div>
                    <a href={href} target="_blank" rel="noreferrer" className="ch-data" style={{ fontSize: 10.5, color: C.leaf, letterSpacing: ".08em" }}>
                      {label.toUpperCase()} ↗
                    </a>
                  </div>
                </motion.li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.11}>
            <Eyebrow color={C.husk}>How to read the numbers</Eyebrow>
            <Stagger className="mt-5 space-y-3" stagger={0.08}>
              {DATA_NOTES.map((n) => (
                <motion.li key={n} variants={vFadeUp} className="flex gap-3" style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(255,255,255,.7)", listStyle: "none" }}>
                  <span style={{ color: C.water }}>▸</span>
                  <span>{n}</span>
                </motion.li>
              ))}
            </Stagger>

            <div className="mt-10 grid grid-cols-3 gap-4">
              {[["309", "fields mapped"], ["23", "villages"], ["12", "programme milestones"]].map(([v, l]) => (
                <div key={l}>
                  <div className="ch-display" style={{ color: "#fff", fontWeight: 800, fontSize: "1.6rem" }}>
                    <Counter value={parseInt(v, 10)} />
                  </div>
                  <div className="ch-data mt-1" style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="mt-16 pt-10" style={{ borderTop: "1px solid rgba(255,255,255,.15)" }}>
          <LogoLockup light height={40} />
          <div className="ch-data mt-8 text-center" style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", letterSpacing: ".1em" }}>
            LOW-EMISSION RICE OFFTAKE · NIZAMABAD, TELANGANA · RABI 2026
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------------------------
   22 · ROOT
---------------------------------------------------------------------------- */
export default function ClearHarvestReport() {
  // one refresh after mount so ScrollTriggers measure against final layout
  // (web fonts and Recharts both change element heights after first paint)
  useEffect(() => {
    const t = setTimeout(() => ScrollTrigger.refresh(), 600);
    if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="ch-root">
      <GlobalStyle />
      <div className="ch-grain" aria-hidden="true" />
      <TopBar />
      <AwdGauge />

      <main>
        <Hero />
        <ImpactStrip />
        <LocationSection />
        <InterventionsSection />
        <GovernanceSection />
        <SequenceSection />
        <TestimonialsSection />
        <PhotographySection />
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