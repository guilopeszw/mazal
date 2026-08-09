/**
 * Ink, as a filter rather than as a mask.
 *
 * The previous build faked this with a `repeating-linear-gradient` mask — a 14% dip at a 4px
 * pitch. It read as a machine scanline on the rules and did nothing at all to the letterforms,
 * because a periodic gradient cannot break a glyph edge. A stamp whose irregularity has a
 * period is not a stamp.
 *
 * What a rubber stamp actually does, in three operations:
 *
 * 1. **Ragged edge.** The die is soft and the paper is not flat, so every boundary wanders.
 *    Fractal noise displacing the source gives that, aperiodically, on glyphs and frame alike.
 * 2. **Lift.** Ink does not transfer everywhere. A second, coarser noise, pushed hard toward
 *    its extremes by a gamma curve, punches voids out of the impression.
 * 3. **Pooling.** Where the die pressed hardest the ink is denser than the nominal colour.
 *    A slight blur composited back under the mark reads as that halo soaking into fibre.
 *
 * Two seeds so the verdict and the row stamps are not the same impression twice — the tell of
 * a duplicated sticker rather than two strikes of a die.
 */
export function InkFilters() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter id="ink-a" x="-12%" y="-22%" width="124%" height="146%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="11" result="edge" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="edge"
            scale="2.1"
            xChannelSelector="R"
            yChannelSelector="G"
            result="ragged"
          />
          <feTurbulence type="fractalNoise" baseFrequency="0.22 0.36" numOctaves="4" seed="5" result="lift" />
          <feComponentTransfer in="lift" result="voids">
            <feFuncA type="gamma" amplitude="1" exponent="7" offset="0" />
          </feComponentTransfer>
          <feComposite in="ragged" in2="voids" operator="out" result="struck" />
          <feGaussianBlur in="struck" stdDeviation="0.7" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="struck" />
          </feMerge>
        </filter>

        <filter id="ink-b" x="-12%" y="-22%" width="124%" height="146%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" seed="29" result="edge" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="edge"
            scale="1.6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="ragged"
          />
          <feTurbulence type="fractalNoise" baseFrequency="0.3 0.42" numOctaves="4" seed="41" result="lift" />
          <feComponentTransfer in="lift" result="voids">
            <feFuncA type="gamma" amplitude="1" exponent="8" offset="0" />
          </feComponentTransfer>
          <feComposite in="ragged" in2="voids" operator="out" result="struck" />
          <feGaussianBlur in="struck" stdDeviation="0.5" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="struck" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
