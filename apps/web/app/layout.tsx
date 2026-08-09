import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import { InkFilters } from "@/components/document/ink";

/**
 * Two faces, and the split is semantic rather than decorative: a Brazilian fiscal document
 * is a pre-printed form filled by a machine. Archivo is the form — the ruled chrome, the
 * field labels, the stamps. Martian Mono is what the machine struck into it — every number,
 * every rule id, every value the engine produced. You can tell at a glance which marks on
 * this page are ours and which are the engine's, because they were made by different tools.
 */
const archivo = Archivo({
  variable: "--font-form",
  subsets: ["latin"],
  display: "swap",
});

const martian = Martian_Mono({
  variable: "--font-struck",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mazal — parecer de subscrição de campanha",
  description:
    "Encontra o primeiro estágio quebrado do funil, nomeia a causa e propõe um plano que você aprova antes de qualquer coisa rodar.",
};

/**
 * The direction contract. It has to survive the production build and be greppable in the
 * emitted markup, and JSX comments do not emit — hence the hidden node.
 */
const CONTRACT = `<!--
THESIS: A diagnosis is not a dashboard. It is an opinion someone issued, numbered and
stamped, that you sign or refuse. Refuses the dark KPI-tile grid the category always ships.
OWN-WORLD: Brazilian transactional print — nota fiscal, boleto, Correios slip. Green
carbonless stock, black impact ink, aniline stamp red, the carbon ghost of the second via.
Ruled hairlines, leader dots, a real Interleaved 2 of 5 barcode, a tear-off perforation.
Archivo is the printed form; Martian Mono is what the machine struck into it.
STORY: The seller reads a verdict, audits any number behind it in seconds, and decides which
proposed actions to sign — seeing plainly which ones are not Mazal's to perform.
FIRST VIEWPORT: One sheet, full width. Emitter block and document number top left, barcode
beneath it; the verdict stamped diagonally in bled red top right. Below, the funnel as a
ruled tracking block: seven numbered rows, the media/product rule across the middle, one row
carrying a red stamp. Primary action sits in the plan panel at the foot of the sheet.
FORM: Via do Cliente — candidate 3 of the grounded list, seed key e285409d.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${martian.variable} h-full`}>
      <body className="min-h-full bg-desk font-form text-ink antialiased">
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        <InkFilters />
        {children}
      </body>
    </html>
  );
}