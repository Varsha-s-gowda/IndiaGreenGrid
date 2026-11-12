import { Zap } from "lucide-react";
import { Card, CardBody, CardHeader } from "../ui/Card";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";

const CHARGE_LABELS = {
  GRID_CHARGE: "Grid charge",
  SOLAR_CREDIT: "Solar credit",
  MAINTENANCE: "Maintenance",
  OTHER_CHARGE: "Other charges",
};

export function EnergySummary({ bill }) {
  const rows = [
    ["Apartment consumption", formatEnergy(bill.consumption_kwh, 3)],
    ["Solar allocation", formatEnergy(bill.solar_allocation_kwh, 3)],
    ["Grid import (consumption − solar)", formatEnergy(bill.grid_import_kwh, 3)],
    ["Solar coverage", formatPercent(bill.solar_coverage_percentage, 2)],
    ["Allocation hours", formatNumber(bill.hour_count)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="text-sm font-semibold text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChargeTable({ bill }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-4 font-medium">Description</th>
            <th className="py-2 pr-4 text-right font-medium">Quantity</th>
            <th className="py-2 pr-4 text-right font-medium">Rate</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(bill.line_items || []).map((item, index) => (
            <tr key={`${item.charge_type}-${item.sort_order ?? index}`}>
              <td className="py-2.5 pr-4">
                <p className="font-medium text-slate-800">
                  {CHARGE_LABELS[item.charge_type] || item.charge_type}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.description}
                </p>
              </td>
              <td className="py-2.5 pr-4 text-right text-slate-600">
                {item.unit === "statement"
                  ? formatNumber(item.quantity)
                  : formatNumber(item.quantity, 3)}{" "}
                {item.unit}
              </td>
              <td className="py-2.5 pr-4 text-right text-slate-600">
                {formatCurrency(item.rate)}
              </td>
              <td
                className={`py-2.5 text-right font-semibold ${
                  Number(item.amount) < 0 ? "text-emerald-700" : "text-slate-800"
                }`}
              >
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td colSpan={3} className="py-3 pr-4 text-right text-xs font-medium text-slate-500">
              Net payable
            </td>
            <td className="py-3 text-right text-base font-bold text-forest-800">
              {formatCurrency(bill.net_payable)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[11px] text-slate-500">
        Net payable = grid charge − internal solar credit + maintenance + other charges.
      </p>
    </div>
  );
}

export function SavingsSummary({ bill }) {
  const rows = [
    ["No-solar baseline", formatCurrency(bill.no_solar_baseline_cost)],
    ["Actual estimated cost", formatCurrency(bill.actual_estimated_cost)],
    ["Estimated savings", formatCurrency(bill.estimated_savings)],
    ["Internal solar credit", formatCurrency(bill.solar_credit)],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
          >
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] leading-5 text-slate-500">
        Estimated savings measure avoided grid electricity at the applicable
        tariff. The internal solar credit is a separate society benefit applied
        to the payable amount. Neither is an official BESCOM charge or credit.
      </p>
    </div>
  );
}

export default function BillBreakdown({ bill, title = "Bill breakdown" }) {
  if (!bill) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        description={`${bill.billing_period_label} · ${bill.allocation_method_label}`}
        icon={Zap}
      />
      <CardBody className="space-y-6 pt-1">
        <EnergySummary bill={bill} />
        <ChargeTable bill={bill} />
        <SavingsSummary bill={bill} />
        {Array.isArray(bill.tariff_snapshot) && bill.tariff_snapshot.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Applicable tariff and rule segments
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Period</th>
                    <th className="py-2 pr-3 text-right font-medium">Tariff/kWh</th>
                    <th className="py-2 pr-3 text-right font-medium">Credit/kWh</th>
                    <th className="py-2 pr-3 text-right font-medium">Consumption</th>
                    <th className="py-2 pr-3 text-right font-medium">Solar</th>
                    <th className="py-2 text-right font-medium">Grid charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bill.tariff_snapshot.map((segment) => (
                    <tr key={`${segment.start_date}-${segment.end_date}`}>
                      <td className="py-2 pr-3 text-slate-700">
                        {segment.start_date} → {segment.end_date}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {formatCurrency(segment.tariff_price_per_kwh)}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {formatCurrency(segment.solar_credit_rate_per_kwh)}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {formatNumber(segment.consumption_kwh, 3)} kWh
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {formatNumber(segment.solar_allocation_kwh, 3)} kWh
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        {formatCurrency(segment.grid_charge)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
