// ─── apps/mcp/src/ui/apps/styles.ts ───────────────────────────────────────
// The web sheet's palette, verbatim from `apps/web/app/globals.css`, so the
// tile reads as the same product: paper ground, ink text, one green accent,
// and `--warn` reserved for the leak alone. `applyDocumentTheme` stamps
// `data-theme` on <html>; `prefers-color-scheme` covers the un-stamped case.

export const SHEET_CSS = `
:root {
  --ground: #edeae1;
  --raised: #f7f3e8;
  --sunken: #e3decd;
  --line: #ddd7c4;
  --line-strong: #c7c0a8;
  --ink: #1e241c;
  --ink-soft: #5c6154;
  --ink-faint: #7d7868;
  --accent: #2e6b47;
  --accent-soft: #e1ebdd;
  --accent-ink: #265a3b;
  --warn: #c62222;
  --warn-soft: #fdecec;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --ground: #171c15;
    --raised: #1e241c;
    --sunken: #262d23;
    --line: #2e362b;
    --line-strong: #414a3d;
    --ink: #edeae1;
    --ink-soft: #a8ad9e;
    --ink-faint: #7d8272;
    --accent: #4c9a6e;
    --accent-soft: #24332a;
    --accent-ink: #7dbf9a;
    --warn: #e05252;
    --warn-soft: #3a2020;
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
  --ground: #171c15;
  --raised: #1e241c;
  --sunken: #262d23;
  --line: #2e362b;
  --line-strong: #414a3d;
  --ink: #edeae1;
  --ink-soft: #a8ad9e;
  --ink-faint: #7d8272;
  --accent: #4c9a6e;
  --accent-soft: #24332a;
  --accent-ink: #7dbf9a;
  --warn: #e05252;
  --warn-soft: #3a2020;
  color-scheme: dark;
}

* { box-sizing: border-box; margin: 0; }
html, body { background: var(--raised); color: var(--ink); }
body {
  font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
  padding: 16px;
}
h1 {
  font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 10px;
}
.headline { font-size: 13px; margin-bottom: 12px; }
.headline strong { color: var(--warn); }
.headline.ok strong { color: var(--accent-ink); }
.muted { color: var(--ink-faint); }
.note { color: var(--ink-soft); font-size: 12px; margin-top: 10px; }

/* funnel */
.funnel { display: grid; gap: 4px; margin: 12px 0; }
.slice { display: grid; grid-template-columns: 96px 1fr 72px; gap: 8px; align-items: center; }
.slice .label { font-size: 11px; color: var(--ink-soft); }
.slice .track { background: var(--sunken); border-radius: 3px; height: 18px; position: relative; }
.slice .bar { height: 100%; border-radius: 3px; background: var(--accent); min-width: 3px; }
.slice.leak .bar { background: var(--warn); }
.slice.after .bar { background: var(--line-strong); }
.slice .count { font-variant-numeric: tabular-nums; text-align: right; font-size: 12px; }
.slice.leak .count { color: var(--warn); font-weight: 600; }

/* stage rows */
.stages { border-top: 1px solid var(--line); margin-top: 12px; }
.stage { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--line); }
.stage .value { font-variant-numeric: tabular-nums; text-align: right; }
.stage.broken .value { color: var(--warn); font-weight: 600; }
.stage.mute .value { color: var(--ink-faint); font-style: italic; }
.stage .tag {
  font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 1px 6px; border-radius: 3px; margin-left: 6px;
}
.stage .tag.leak { background: var(--warn-soft); color: var(--warn); }
.stage .tag.skipped { background: var(--sunken); color: var(--ink-faint); }

/* prediction band */
.stamp {
  display: inline-block; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  font-size: 12px; padding: 3px 10px; border: 1.5px solid; border-radius: 4px; margin-bottom: 14px;
}
.stamp.launch { color: var(--accent-ink); border-color: var(--accent); background: var(--accent-soft); }
.stamp.launch_small { color: var(--ink-soft); border-color: var(--line-strong); background: var(--sunken); }
.stamp.dont_launch { color: var(--warn); border-color: var(--warn); background: var(--warn-soft); }
.band { position: relative; height: 34px; margin: 26px 0 6px; }
.band .track { position: absolute; inset: 12px 0; background: var(--sunken); border-radius: 4px; }
.band .fill { position: absolute; top: 12px; bottom: 12px; background: var(--accent-soft); border: 1px solid var(--accent); border-radius: 4px; }
.band .mid { position: absolute; top: 8px; bottom: 8px; width: 2px; background: var(--accent); }
.band .break-even { position: absolute; top: 2px; bottom: 2px; width: 2px; background: var(--ink); }
.band .break-even .flag {
  position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
  white-space: nowrap; font-size: 10px; color: var(--ink-soft);
}
.ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.ends .mid-label { color: var(--accent-ink); font-weight: 600; }
`;
