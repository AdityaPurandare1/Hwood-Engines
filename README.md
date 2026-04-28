# Hwood Engines

Operational engines for Hwood Group venues. A Next.js shell that hosts three independent tools at clean URL paths.

| Engine | Path | What it does |
|---|---|---|
| **Keva** | `/keva` | Production capacity planner — depletion-weighted batch capacity per recipe |
| **Inventory Workflow** | `/inventory/` | Stock movement, transfers, counts, reconciliation |
| **Procurement Engine** | `/procurement/` | Dual-loop Min/Max + warehouse s/S, first orders, TCO |

---

## Layout

```
app/
  layout.js              shared metadata
  page.jsx               landing page (links to all three engines)
  keva/
    layout.js            Keva-specific metadata
    page.jsx             Keva React app (originally keva-capacity-planner)
public/
  inventory/             static HTML (originally inventory-workflow)
  procurement/           static HTML demo (originally Hwood-procurement-engine)
procurement-engine-source/  Python library reference (not deployed)
```

The two static HTML apps in `public/` are served verbatim — they're fully self-contained (inline CSS + JS), so no build step touches them.

---

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the landing page links to all three engines.

---

## Build & Deploy

```bash
npm run build
```

Produces a static export in `out/`. Deploy `out/` to any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

If hosting under a sub-path, set `NEXT_PUBLIC_BASE_PATH` before building (see `next.config.js`).

---

## Notes

- The original repos (`keva-capacity-planner`, `inventory-workflow`, `Hwood-procurement-engine`) remain on GitHub unchanged.
- The Python procurement engine in `procurement-engine-source/` is a CLI library — it is **not** deployed with the website. Run it locally with Python 3.10+.
