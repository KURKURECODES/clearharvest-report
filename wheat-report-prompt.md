I'm building a project report for a wheat crop programme, following the exact same design system, structure and animation approach as an existing rice project report called ClearHarvest (a React component originally at ClearHarvest.jsx, with a companion map file ClearHarvestMap.jsx).

I've copied the same project scaffolding into this folder already:
- package.json, vite.config.js, tailwind.config.js, postcss.config.js
- The rice report's component files (ClearHarvest.jsx + ClearHarvestMap.jsx) as reference/template
- The same dependencies: framer-motion, gsap (with ScrollTrigger), recharts, maplibre-gl

What I need you to do:

1. Read ClearHarvest.jsx and ClearHarvestMap.jsx in this folder fully, end to end, so you understand:
   - The design tokens (the `C` color palette, FONT_DISPLAY/FONT_BODY/FONT_DATA, the EASE curves)
   - The motion system (Reveal, Stagger, MaskedHeading, Parallax, Counter, Magnetic, useBatchReveal, the GSAP scroll-triggered timelines)
   - The shared chrome components (Eyebrow, SectionHead, Section, GeoStamp, TopBar, LogoSlot/LogoLockup)
   - The section-by-section structure and order (Hero → Impact counters → Location/map → Interventions → Governance → Sequence of events → Testimonials → Photography → Benefits → Pinned statement → Results/charts → Season timeline → Economics → Sourcing alignment → Evidence annexures → About → Closing)
   - How PhotoSlot and the gallery/testimonial/evidence components are built so photos and videos drop in via a single `src` prop without restructuring anything

2. Create a new component for the wheat report — call it WheatHarvest.jsx (and WheatHarvestMap.jsx if the location/map section carries over) — that reuses the exact same design tokens, motion system, and shared components as the rice report, but is a clean, separate component (do not edit ClearHarvest.jsx/ClearHarvestMap.jsx — leave them untouched as reference).

3. Set up a clearly separate photo/media import section at the top of WheatHarvest.jsx, distinct from the rice report's image imports — organized by the wheat programme's own sections (e.g. village meetings, input distribution, field monitoring, harvest, evidence/annexures, testimonials) with placeholder import statements and PhotoSlot usage ready to receive real filenames. Point these at a new src/assets folder for wheat (not the rice one) so there's no filename collision.

4. For now, scaffold every section with the same structure and component types as the rice report but with generic/placeholder copy and data arrays clearly marked (e.g. `// TODO: replace with wheat programme data`), since I will paste in the actual wheat content (stats, narrative text, farmer testimonials, timeline, results numbers) and hand you the real photos next. Do not invent wheat-specific facts or numbers — leave clearly marked placeholders instead.

5. Wire the new component into a root App entry point (or index.html/main entry, whatever this scaffolded project uses) so it runs standalone with `npm run dev`, independent of the rice project.

6. Confirm the dev server runs and the page renders without console errors before telling me it's ready.

Once this scaffold is in place, I'll share the actual wheat report content (text, stats, tables) and the real photos/videos, section by section, for you to drop in — keeping the visual design, animation language and layout identical to the rice ClearHarvest report throughout.
