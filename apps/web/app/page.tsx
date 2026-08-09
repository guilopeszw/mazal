import { OLIST_CATEGORIES } from "@mazal/contracts";
import { diagnosisFixture } from "@/lib/fixtures";
import { FUNNEL_STAGES, MEDIA_PRODUCT_BOUNDARY, toneFor } from "@/lib/funnel";

const TONE = {
  upstream: "bg-emerald-500/90 border-emerald-400",
  leak: "bg-red-500 border-red-400",
  downstream: "bg-neutral-700/60 border-neutral-600",
} as const;

export default function Home() {
  const leak = diagnosisFixture.primary?.stage ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mazal</h1>
        <p className="text-sm text-neutral-500">
          Campanhas não deveriam depender de sorte.
        </p>
      </header>

      <section className="flex flex-col gap-1.5">
        {FUNNEL_STAGES.map(({ stage, label, metrics }) => (
          <div key={stage}>
            {stage === MEDIA_PRODUCT_BOUNDARY && (
              <div className="flex items-center gap-3 py-3 text-[11px] uppercase tracking-widest text-neutral-500">
                <span className="h-px flex-1 bg-neutral-600" />
                mídia · produto
                <span className="h-px flex-1 bg-neutral-600" />
              </div>
            )}
            <div
              className={`flex items-baseline justify-between rounded border-l-4 px-4 py-3 text-white ${TONE[toneFor(stage, leak)]}`}
            >
              <span className="font-medium">
                {stage} · {label}
              </span>
              <span className="text-xs opacity-80">{metrics}</span>
            </div>
          </div>
        ))}
      </section>

      <p className="text-xs text-neutral-500">
        Fiação do workspace: {OLIST_CATEGORIES.length} categorias Olist importadas de{" "}
        <code className="font-mono">@mazal/contracts</code>. Diagnóstico mockado — regra{" "}
        <code className="font-mono">{diagnosisFixture.primary.rule}</code>.
      </p>
    </main>
  );
}
