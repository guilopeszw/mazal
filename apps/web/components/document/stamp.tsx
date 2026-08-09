/**
 * The carimbo. One saturated mark on an otherwise black-on-green sheet, and the thing the
 * room reads first from the back row.
 *
 * A rubber stamp is not a badge: it is struck by hand, so it sits off-square, its double rule
 * is uneven, and the ink neither fills solidly nor lands entirely inside the frame. Those are
 * the three properties that separate it from a rounded pill with a red background, and all
 * three are cheap — a rotation, a doubled border, and a mask that eats the fill.
 */
export function Stamp({
  children,
  tone = "verdict",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "verdict" | "notice" | "seal";
  className?: string;
}) {
  const tones = {
    verdict: "text-stamp border-stamp -rotate-[7deg]",
    notice: "text-stamp-soft border-stamp-soft -rotate-[3deg]",
    seal: "text-seal border-seal rotate-[2deg]",
  } as const;

  return (
    <span
      className={`inline-flex select-none items-center border-[3px] px-3 py-1.5 text-center font-form text-sm font-extrabold uppercase leading-none tracking-[0.14em] shadow-[inset_0_0_0_1px_currentColor] ink-bleed ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
