/**
 * The carimbo. One saturated mark on an otherwise black-on-green sheet, and the thing the room
 * reads first from the back row.
 *
 * A rubber stamp is not a badge. It sits off-square, its ink neither fills solidly nor lands
 * entirely inside the frame, and no two strikes are the same impression — so the irregularity
 * comes from an SVG displacement filter (`components/document/ink.tsx`) that actually breaks
 * the letterforms, and the two filters alternate so the verdict and the row stamp are two
 * strikes of a die rather than one sticker used twice.
 */
export function Stamp({
  children,
  tone = "verdict",
  impression = "a",
  strike = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "verdict" | "notice" | "seal";
  impression?: "a" | "b";
  /** The one authored motion on the sheet. Reserved for the verdict. */
  strike?: boolean;
  className?: string;
}) {
  const tones = {
    verdict: "text-stamp border-stamp -rotate-[7deg]",
    notice: "text-stamp-soft border-stamp-soft -rotate-[3deg]",
    seal: "text-seal border-seal rotate-[2deg]",
  } as const;

  return (
    <span
      className={`inline-flex select-none items-center border-[3px] px-3 py-1.5 text-center font-form text-sm font-extrabold uppercase leading-none tracking-[0.14em] shadow-[inset_0_0_0_1px_currentColor] ${
        impression === "a" ? "struck-a" : "struck-b"
      } ${strike ? "strike-down" : ""} ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
