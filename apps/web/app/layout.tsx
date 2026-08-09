import type { Metadata } from "next";
import { Albert_Sans, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * The identity's two families. Albert Sans carries the interface; Newsreader carries the
 * wordmark, the headline, and the verdict — the three places Mazal speaks rather than reports.
 *
 * `opsz` is requested explicitly because next/font ships only the `wght` axis of a variable
 * font unless asked otherwise, and Newsreader's optical size defaults to 16. The verdict sets
 * at 23px and the hero headline at 46; without the axis both would render with the letter
 * shapes of body copy.
 *
 * The italic is loaded for the same reason: the one word the hero stresses is set in it, and
 * a browser-synthesised slant of a real serif is a sheared roman, not the drawn italic.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mazal",
  description:
    "Campaigns shouldn't need luck. Mazal finds the first broken stage of your funnel, names what caused it, and proposes a plan you approve before anything runs.",
};

/**
 * Applies a saved theme before anything paints. It has to be a blocking inline script at the
 * top of the document — a React effect runs after first paint, which is exactly the flash of
 * the wrong theme this exists to prevent.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("mazal-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script mutates <html data-theme> before React hydrates.
    <html
      lang="en"
      className={`${albertSans.variable} ${newsreader.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-ground font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
