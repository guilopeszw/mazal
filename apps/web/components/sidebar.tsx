"use client";

import { useEffect, useState } from "react";
import { Mark } from "./mark";

/**
 * The left sidebar, and the one button that opens it.
 *
 * The whole point of the arrangement is that the mark does not move. Closed, the button lives
 * in the page header at 20px from the left edge; open, the shell is pushed aside and the twin
 * inside this panel stands on exactly the same pixel, with the wordmark unfolding to its right.
 * That only holds if both live in an identical row, which is why the button is one component
 * rendered in two mutually exclusive places rather than two sets of matching magic numbers.
 *
 * The body is deliberately empty. There is one ephemeral conversation in this build and no
 * account behind it, so there is no history to list — and an invented list would be worse than
 * the space.
 */

/** House motion: the easing of `rise` and of the composer's slide, at panel length. */
const SLIDE = "duration-[240ms] ease-[cubic-bezier(0.16,0.84,0.44,1)]";

/**
 * The mark, which becomes an affordance under a cursor.
 *
 * At rest it is only the identity. Hover and focus-visible cross-fade it into a panel glyph —
 * *and focus-visible is not optional here*: hover reaches neither a keyboard nor a thumb, and
 * this button is the sidebar's only door. It is a real button at all times; the cursor reveals
 * what it already was rather than making it one.
 *
 * `-mx-[7.5px]` is what keeps the promise above. The button is a 32px target so it matches the
 * row height, but the 17px mark inside it has to sit flush at the row's 20px padding and leave
 * the wordmark its original 9px gap, so the target's overhang is pulled back on both sides.
 */
export function MarkButton({
  open,
  onClick,
  ref,
}: {
  open: boolean;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={open ? "Close sidebar" : "Open sidebar"}
      aria-expanded={open}
      aria-controls="sidebar"
      className="group relative -mx-[7.5px] grid size-8 flex-none place-items-center rounded-lg transition-[background-color,scale] duration-150 after:absolute after:-inset-1 hover:bg-sunken focus-visible:bg-sunken active:scale-[.96]"
    >
      <Mark className="col-start-1 row-start-1 size-[17px] text-accent transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="col-start-1 row-start-1 size-[17px] text-ink-soft opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2.6" />
        <path d="M9.4 4v16" />
      </svg>
    </button>
  );
}

/**
 * Light and dark, moved out of the header and into the account menu.
 *
 * The logic is unchanged from the header toggle it replaces — the theme is read from the
 * attribute the blocking script in the layout already set, because the server cannot know it
 * and guessing would be a hydration mismatch on that very attribute. Only the presentation is
 * new: a menu row that names the theme it switches *to*, matching the old button's label.
 */
function ThemeRow() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setDark(attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mazal-theme", next);
    } catch {
      // Private mode: the toggle still works for the session.
    }
    setDark(!dark);
  };

  return (
    <button
      type="button"
      onClick={flip}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-soft transition-[background-color,color] duration-150 hover:bg-sunken hover:text-ink"
    >
      {dark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[15px] flex-none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[15px] flex-none"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      )}
      {dark ? "Light theme" : "Dark theme"}
    </button>
  );
}

/**
 * The account row and what it opens.
 *
 * `Demo account` is the honest label: this build has no login, no session and no user record,
 * and putting a person's name here would be inventing one. The theme is the only setting that
 * actually exists, so it is the only thing in the menu.
 */
function Account() {
  const [menu, setMenu] = useState(false);

  return (
    <div className="mt-auto border-t border-line p-3">
      {/* Opens upward: the row is already at the bottom of the panel. */}
      {menu && (
        <div className="rise mb-1.5 overflow-hidden rounded-[10px] border border-line bg-raised">
          <ThemeRow />
        </div>
      )}
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-expanded={menu}
        className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-[background-color] duration-150 hover:bg-sunken"
      >
        <span className="grid size-7 flex-none place-items-center rounded-full bg-sunken text-ink-faint">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[15px]"
            aria-hidden="true"
          >
            <circle cx="12" cy="8.4" r="3.4" />
            <path d="M5.2 19.6a6.8 6.8 0 0113.6 0" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">Demo account</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-[13px] flex-none text-ink-faint transition-transform duration-150 ${menu ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M6 14l6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The panel is the same panel at every width; what differs is what it does to the page.
 * Above `md` it pushes, and `chat.tsx` carries that half — the rail the shell is padded by.
 * Below `md` the rail is nil and the panel lies over the page instead, because there is no
 * width left to give away, and this is the scrim that dims what it covers.
 *
 * `inert` rather than an unmount: the panel has to stay in the DOM for the slide to run, and
 * off-screen focusable children are still tabbable without it. React 19 takes it as a plain
 * boolean prop.
 *
 * No focus trap, deliberately. Where it pushes, this is a region standing beside the page
 * rather than a modal over it, and holding focus captive in it would be a lie about what it
 * is. Escape closes from either side.
 */
export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      {/* Tinted 30/40/30 like the composer's shadow rather than neutral black, which on warm
          paper reads as a cold patch. `md:hidden` because above it there is nothing to dim —
          the page has moved out from under the panel rather than beneath it. */}
      <div
        onClick={onToggle}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-[rgb(30_40_30/0.36)] transition-opacity md:hidden ${SLIDE} ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="sidebar"
        aria-label="Mazal"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-line bg-ground transition-transform ${SLIDE} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Geometrically the page header, to the pixel: same padding, same 32px row, same rule. */}
        <div className="border-b border-line px-5 py-3.5">
          <div className="flex h-8 items-center gap-[9px]">
            <MarkButton open={open} onClick={onToggle} />
            <span className="font-serif text-[19px] font-medium leading-none tracking-[-0.01em]">
              Mazal
            </span>
            {/* accent, not the old `ref` gold: that ramp was deleted with the one-accent pass,
                and a class Tailwind no longer generates fails silently — no background, no
                colour, no error. */}
            <span className="rounded-[5px] bg-accent-soft px-[7px] py-[2.5px] text-[10.5px] font-[550] lowercase tracking-[0.04em] text-accent-ink">
              beta
            </span>
          </div>
        </div>

        {/* No body. `mt-auto` on the account block is the whole layout. */}
        <Account />
      </aside>
    </>
  );
}
