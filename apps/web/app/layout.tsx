import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-ground font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
