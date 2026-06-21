## Goal

Import the uploaded `astorekh.zip` project (a Vite + React + Supabase shop‑management app currently branded as "Mobile Mate") into this Lovable workspace and rebrand it everywhere to **MOBILE MATE PRO**, including logos, app titles, PWA metadata, in‑app text, and printed reports.

## Approach

The current workspace only contains the empty TanStack Start starter template. The uploaded project is a full Vite/React app with its own router, Supabase integration, and ~50 components. Rather than porting it to TanStack Start (which would be a multi‑day rewrite), I will replace the starter with the uploaded project as‑is, then apply the rebrand on top.

### Step 1 – Bring the uploaded project into the workspace
- Extract `astorekh.zip` to a temp folder (already done).
- Verify no `.git` is copied; copy everything except `.git`, `node_modules`, `bun.lock`, `package-lock.json` into the project root, overwriting the TanStack starter files (`src/routes`, `src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/styles.css`, `vite.config.ts`, `tsconfig.json`, `package.json`, etc.).
- Remove now‑obsolete TanStack files (`src/routeTree.gen.ts`, `src/routes/`, `src/start.ts`, `src/server.ts`, `src/lib/lovable-error-reporting.ts` if unused).
- Install dependencies (`bun install`) so the dev server boots on the imported Vite config.

### Step 2 – Replace logo assets
- Generate a new "MOBILE MATE PRO" logo (premium tier, transparent PNG) and save it as `src/assets/mobile-mate-pro-logo.png`.
- Generate a matching favicon / app icon set (192, 512, maskable, apple‑touch, favicon.ico/png) under `public/`.
- Delete the old brand assets: `apple-point-logo.png`, `apple-point-logo.svg`, `big-boss-logo.png`, and the unused UUID‑named PNGs that were used as default logos (`3926e988-…png` etc. — only the ones referenced as logos).

### Step 3 – Replace branding strings → "MOBILE MATE PRO"
Update every occurrence found in the project:
- `index.html` – `<title>`, `meta[name=author]`, `meta[name=apple-mobile-web-app-title]`, all `og:title` / `twitter:title`.
- `src/App.tsx` – splash screen `<img alt>` and `<h2>` text + swap `defaultLogo` import to the new logo.
- `src/components/BrandingSettings.tsx` – default `shop_name` and input placeholder.
- `src/hooks/useShopSettings.ts` – default `shop_name`.
- `src/components/Investments.tsx`, `Products.tsx`, `Returns.tsx`, `returns/ReconciliationReport.tsx`, `StaffPerformanceReport.tsx` – every print‑report title, heading, footer string; update the `big-boss-logo` import in `StaffPerformanceReport.tsx` to the new logo.
- `src/lib/backupExport.ts` – backup header label and `app` field in the export payload.
- `public/manifest.webmanifest` (create if missing, since `index.html` references it) – `name`, `short_name`, `theme_color`, icon paths pointing at the new icon set.
- Any remaining `"Mobile Mate"` / `"Apple Point"` / `"Big Boss"` / `astorekh` references surfaced by a final `rg` sweep across `src/`, `public/`, and `supabase/` config files.

### Step 4 – Verify
- Confirm the dev server builds and the splash screen, header, settings page, and a print report all read "MOBILE MATE PRO" with the new logo.
- Confirm no broken image imports remain (removed asset filenames).

## Technical notes

- The imported project uses `react-router-dom`, `@tanstack/react-query` (not TanStack Router/Start), Supabase client, and `vite`. The Lovable Cloud (Supabase) connection from the original project will not carry over — the user will need to reconnect Lovable Cloud if they want the backend to work, but that is outside this rebranding task.
- `.git` from the zip will be excluded from the copy to protect the workspace repo.
- No business logic, schema, or feature behavior will change — only branding strings, logo assets, and metadata.

## Open question

Do you have a specific logo design or color preference for "MOBILE MATE PRO" (e.g. keep the current teal `#1B5F74` accent, or pick a new palette)? If you don't specify, I'll generate a clean, modern mark in the existing teal so it matches the current theme.
