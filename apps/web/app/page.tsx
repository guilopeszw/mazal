import { aggregate, roas } from "@mazal/contracts/metrics";
import { DailyChart } from "@/components/daily-chart";
import { Despacho } from "@/components/despacho";
import { DocumentHeader } from "@/components/document/header";
import { Field, Quadro, Sheet } from "@/components/document/sheet";
import { FindingEntry } from "@/components/finding-entry";
import { FunnelBlock } from "@/components/funnel-block";
import { PlanPanel } from "@/components/plan-panel";
import { DEMO_CASES } from "@/lib/fixtures";
import { formatBRL, formatCount, formatMetric } from "@/lib/format";

export default function Home() {
  const demo = DEMO_CASES.case2;
  const { diagnosis, category, reference, days, card, actions, counter } = demo;
  const flight = aggregate(days);

  return (
    <main className="mx-auto flex max-w-[84rem] flex-col gap-6 px-3 py-6 sm:px-6 sm:py-10 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
      <Sheet>
        <DocumentHeader
          diagnosis={diagnosis}
          reference={reference}
          campaignId={flight.campaignId}
          lastDate={days[days.length - 1]!.date}
          moment={demo.moment}
        />

        <Quadro title="localização do vazamento" aside="primeiro estágio que desviou">
          <FunnelBlock leak={diagnosis.primary?.stage ?? null} />
        </Quadro>

        {diagnosis.primary && (
          <Quadro title="apuração" aside={`regra ${diagnosis.primary.rule}`}>
            <FindingEntry
              finding={diagnosis.primary}
              category={category}
              reference={reference}
            />
          </Quadro>
        )}

        <Quadro title="série diária">
          <DailyChart
            days={days}
            metric={diagnosis.changePoint?.metric ?? diagnosis.primary?.metric ?? "atcRate"}
            changePoint={diagnosis.changePoint?.date}
          />
        </Quadro>

        {diagnosis.secondary.length > 0 && (
          <Quadro title="sintomas a jusante" aside="consequências, não causas">
            <div className="divide-y divide-rule">
              {diagnosis.secondary.map((finding) => (
                <FindingEntry
                  key={finding.rule}
                  finding={finding}
                  category={category}
                  reference={reference}
                />
              ))}
            </div>
          </Quadro>
        )}

        <Quadro title="campanha" aside="período completo">
          <div className="grid gap-x-10 sm:grid-cols-2">
            <Field label="investido">{formatBRL(flight.spend)}</Field>
            <Field label="receita">{formatBRL(flight.revenue)}</Field>
            <Field label="cliques">{formatCount(flight.clicks)}</Field>
            <Field label="vendas">{formatCount(flight.purchases)}</Field>
            <Field label="roas">{formatMetric("roas", roas(flight))}</Field>
            <Field label="roas de equilíbrio">
              {formatMetric("roas", 1 / card.grossMargin)}
            </Field>
          </div>
        </Quadro>

        <PlanPanel actions={actions} counter={counter} />
      </Sheet>
      </div>

      <Despacho diagnosis={diagnosis} reference={reference} actionCount={actions.length} />
    </main>
  );
}
