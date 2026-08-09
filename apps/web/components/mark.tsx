/**
 * Mazal's clover, sized by the parent.
 *
 * One leaf, drawn once in the top-left quadrant and mirrored into the other three. Keeping it
 * a single path means the four leaves cannot drift out of register at small sizes, which is
 * the whole risk with a mark that has to survive being a 16px favicon.
 *
 * Its own file because two components need it now — the header lockup and the sidebar — and a
 * mark that exists twice is a mark that eventually differs. `app/icon.svg` carries the same
 * four paths a third time, but that one is a static file Next serves by filename convention
 * and cannot import anything.
 */
const LEAF =
  "M3.9 0.5H7.4A3.4 3.4 0 0 1 10.8 3.9V10.8H3.9A3.4 3.4 0 0 1 0.5 7.4V3.9A3.4 3.4 0 0 1 3.9 0.5Z";

const LEAF_MIRRORS = [
  undefined,
  "translate(24 0) scale(-1 1)",
  "translate(0 24) scale(1 -1)",
  "translate(24 24) scale(-1 -1)",
];

export function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {LEAF_MIRRORS.map((transform, i) => (
        <path key={i} d={LEAF} transform={transform} />
      ))}
    </svg>
  );
}
