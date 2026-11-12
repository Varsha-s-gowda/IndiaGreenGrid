import {
  ArrowRight,
  Check,
  Gauge,
  Scale,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardBody } from "../ui/Card";
import { formatEnergy, formatPercent } from "../../lib/formatters";
import { METHOD_META, METHOD_ORDER } from "../../lib/allocation";
import MethodBadge from "./MethodBadge";

const ICONS = {
  EQUAL_SHARE: Users,
  CONSUMPTION_BASED: TrendingUp,
  OWNERSHIP_BASED: Scale,
};

export default function MethodCards({
  comparison = null,
  selected = null,
  onSelect,
  selectLabel = "Use this method",
}) {
  const methodResults = new Map(
    (comparison?.methods || []).map((result) => [result.method, result])
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {METHOD_ORDER.map((key) => {
        const meta = METHOD_META[key];
        const Icon = ICONS[key] || Gauge;
        const result = methodResults.get(key);
        const active = selected === key;

        return (
          <Card
            key={key}
            className={
              active
                ? "ring-2 ring-forest-500 ring-offset-2"
                : "transition hover:border-slate-300"
            }
          >
            <CardBody className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                  style={{
                    borderColor: `${meta.color}33`,
                    backgroundColor: `${meta.color}12`,
                    color: meta.color,
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <MethodBadge method={key} />
              </div>

              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {meta.label}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {meta.tagline}
              </p>

              <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[11px]">
                <div>
                  <dt className="font-medium uppercase tracking-[0.08em] text-slate-400">
                    Weights
                  </dt>
                  <dd className="mt-0.5 text-slate-600">{meta.weights}</dd>
                </div>
                <div>
                  <dt className="font-medium uppercase tracking-[0.08em] text-slate-400">
                    Formula
                  </dt>
                  <dd className="mt-0.5 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
                    {meta.formula}
                  </dd>
                </div>
              </dl>

              {result && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                      Allocated
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-900">
                      {formatEnergy(result.totals.total_allocated_kwh, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                      Avg coverage
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-900">
                      {formatPercent(
                        result.fairness.average_coverage_percentage
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                      Jain
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-900">
                      {result.fairness.jain_index == null
                        ? "—"
                        : result.fairness.jain_index.toFixed(3)}
                    </p>
                  </div>
                </div>
              )}

              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "border-forest-200 bg-forest-50 text-forest-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {active ? <Check size={13} /> : null}
                  {active ? "Selected" : selectLabel}
                  {!active && <ArrowRight size={13} />}
                </button>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
