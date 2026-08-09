/**
 * Interleaved 2 of 5 — the symbology a Brazilian boleto actually carries.
 *
 * It is encoded properly rather than drawn as decorative stripes. The whole surface argues
 * that any number on it can be audited; a barcode that encodes nothing would be the one mark
 * on the page that lies, and it would lie in the world's own signature element. Ten patterns
 * and a start/stop pair is the entire specification, so there is no excuse.
 *
 * Digits are taken in pairs: the first is drawn as five bars, the second as the five spaces
 * between them — which is where "interleaved" comes from and why the payload must be even.
 */

const PATTERNS = [
  "nnwwn", // 0
  "wnnnw", // 1
  "nwnnw", // 2
  "wwnnn", // 3
  "nnwnw", // 4
  "wnwnn", // 5
  "nwwnn", // 6
  "nnnww", // 7
  "wnnwn", // 8
  "nwnwn", // 9
] as const;

const NARROW = 2;
const WIDE = 5;
const QUIET = 10; // the mandatory quiet zone; a reader needs it and so does the eye

type Element = { wide: boolean; bar: boolean };

function encode(payload: string): Element[] {
  const digits = payload.replace(/\D/g, "");
  const even = digits.length % 2 === 0 ? digits : `0${digits}`;

  const elements: Element[] = [
    { wide: false, bar: true },
    { wide: false, bar: false },
    { wide: false, bar: true },
    { wide: false, bar: false },
  ];

  for (let i = 0; i < even.length; i += 2) {
    const bars = PATTERNS[Number(even[i])]!;
    const spaces = PATTERNS[Number(even[i + 1])]!;
    for (let k = 0; k < 5; k++) {
      elements.push({ wide: bars[k] === "w", bar: true });
      elements.push({ wide: spaces[k] === "w", bar: false });
    }
  }

  elements.push({ wide: true, bar: true }, { wide: false, bar: false }, { wide: false, bar: true });
  return elements;
}

export function Barcode({
  payload,
  height = 34,
  className,
}: {
  payload: string;
  height?: number;
  className?: string;
}) {
  const elements = encode(payload);
  const width =
    QUIET * 2 + elements.reduce((sum, e) => sum + (e.wide ? WIDE : NARROW), 0);

  let x = QUIET;
  const bars = elements.map((element, i) => {
    const w = element.wide ? WIDE : NARROW;
    const rect = element.bar ? { x, w, key: i } : null;
    x += w;
    return rect;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`Código de barras do documento ${payload}`}
      preserveAspectRatio="xMinYMid meet"
    >
      {bars.map((bar) =>
        bar ? (
          <rect key={bar.key} x={bar.x} y={0} width={bar.w} height={height} fill="currentColor" />
        ) : null,
      )}
    </svg>
  );
}
