import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp, Search } from "lucide-react";
import EmptyState from "../ui/EmptyState";
import { formatNumber, formatPercent } from "../../lib/formatters";
import { METHOD_ORDER, methodShortLabel } from "../../lib/allocation";
import MethodBadge from "./MethodBadge";

const SUMMARY_SORTS = {
  flat: (row) => row.flat_number,
  consumption: (row) => row.total_consumption_kwh,
  allocation: (row) => row.total_solar_allocation_kwh,
  coverage: (row) => row.solar_coverage_percentage,
  credit: (row) => row.estimated_solar_credit,
};

export default function ApartmentAllocationTable({
  rows = [],
  mode = "summary",
  compact = false,
  emptyTitle = "No apartment rows",
  emptyDescription = "Run an allocation or adjust the selected run and date range.",
  linkToApartment = false,
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("allocation");
  const [descending, setDescending] = useState(true);

  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase();
    const filteredRows = term
      ? rows.filter((row) => row.flat_number.toUpperCase().includes(term))
      : [...rows];

    if (mode === "compare") {
      if (sortKey === "flat") {
        filteredRows.sort((left, right) =>
          left.flat_number.localeCompare(right.flat_number)
        );
      } else if (sortKey === "spread") {
        filteredRows.sort(
          (left, right) => left.allocation_spread_kwh - right.allocation_spread_kwh
        );
      } else {
        filteredRows.sort(
          (left, right) => left.consumption_kwh - right.consumption_kwh
        );
      }
    } else {
      const selector = SUMMARY_SORTS[sortKey] || SUMMARY_SORTS.allocation;
      filteredRows.sort((left, right) => {
        const leftValue = selector(left);
        const rightValue = selector(right);
        if (typeof leftValue === "string") {
          return leftValue.localeCompare(rightValue);
        }
        return Number(leftValue) - Number(rightValue);
      });
    }

    if (descending) filteredRows.reverse();
    return filteredRows;
  }, [rows, search, sortKey, descending, mode]);

  const maxHeight = compact ? "max-h-[22rem]" : "max-h-[34rem]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            className="field h-9 w-44 pl-8 text-xs"
            placeholder="Search flat number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search allocation by flat number"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <ArrowDownUp size={12} />
          <select
            className="field h-9 w-36 text-xs"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            aria-label="Sort allocation rows"
          >
            <option value="flat">Flat number</option>
            {mode === "compare" ? (
              <>
                <option value="consumption">Consumption</option>
                <option value="spread">Allocation spread</option>
              </>
            ) : (
              <>
                <option value="allocation">Solar allocation</option>
                <option value="coverage">Coverage</option>
                <option value="consumption">Consumption</option>
                <option value="credit">Estimated credit</option>
              </>
            )}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          onClick={() => setDescending((current) => !current)}
        >
          {descending ? "Descending" : "Ascending"}
        </button>
        <span className="ml-auto text-[11px] text-slate-500">
          {formatNumber(filtered.length)} of {formatNumber(rows.length)} flats
        </span>
      </div>

      {!filtered.length ? (
        <div className="px-5 pb-5">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        </div>
      ) : (
        <div className={`${maxHeight} overflow-auto scrollbar-thin`}>
          {mode === "compare" ? (
            <CompareTable
              rows={filtered}
              linkToApartment={linkToApartment}
            />
          ) : (
            <SummaryTable rows={filtered} linkToApartment={linkToApartment} />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTable({ rows, linkToApartment }) {
  return (
    <table className="min-w-full text-left text-xs">
      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
        <tr>
          <th className="px-5 py-2.5 font-semibold">Flat</th>
          <th className="px-3 py-2.5 font-semibold">Category</th>
          <th className="px-3 py-2.5 text-right font-semibold">Ownership</th>
          <th className="px-3 py-2.5 text-right font-semibold">Consumption</th>
          <th className="px-3 py-2.5 text-right font-semibold">Solar</th>
          <th className="px-3 py-2.5 text-right font-semibold">Grid</th>
          <th className="px-3 py-2.5 text-right font-semibold">Coverage</th>
          <th className="px-5 py-2.5 text-right font-semibold">Credit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.apartment_id} className="border-t border-slate-100">
            <td className="px-5 py-2.5 font-medium text-slate-800">
              {linkToApartment ? (
                <Link
                  to={`/allocation/apartments?flat=${encodeURIComponent(row.flat_number)}`}
                  className="text-forest-700 hover:underline"
                >
                  {row.flat_number}
                </Link>
              ) : (
                row.flat_number
              )}
            </td>
            <td className="px-3 py-2.5 text-slate-500">{row.apartment_category}</td>
            <td className="px-3 py-2.5 text-right text-slate-600">
              {formatPercent(row.ownership_percentage, 3)}
            </td>
            <td className="px-3 py-2.5 text-right text-slate-600">
              {formatNumber(row.total_consumption_kwh, 1)}
            </td>
            <td className="px-3 py-2.5 text-right font-medium text-slate-800">
              {formatNumber(row.total_solar_allocation_kwh, 2)}
            </td>
            <td className="px-3 py-2.5 text-right text-slate-500">
              {formatNumber(row.total_grid_import_kwh, 1)}
            </td>
            <td className="px-3 py-2.5 text-right">
              <CoveragePill value={row.solar_coverage_percentage} />
            </td>
            <td className="px-5 py-2.5 text-right font-semibold text-slate-900">
              ₹{formatNumber(row.estimated_solar_credit, 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompareTable({ rows, linkToApartment }) {
  return (
    <table className="min-w-full text-left text-xs">
      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
        <tr>
          <th className="px-5 py-2.5 font-semibold">Flat</th>
          <th className="px-3 py-2.5 text-right font-semibold">Consumption</th>
          {METHOD_ORDER.map((method) => (
            <th key={method} className="px-3 py-2.5 text-right font-semibold">
              {methodShortLabel(method)} kWh
            </th>
          ))}
          <th className="px-3 py-2.5 text-right font-semibold">Spread</th>
          <th className="px-5 py-2.5 text-right font-semibold">Coverage range</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.apartment_id} className="border-t border-slate-100">
            <td className="px-5 py-2.5 font-medium text-slate-800">
              {linkToApartment ? (
                <Link
                  to={`/allocation/apartments?flat=${encodeURIComponent(row.flat_number)}`}
                  className="text-forest-700 hover:underline"
                >
                  {row.flat_number}
                </Link>
              ) : (
                row.flat_number
              )}
            </td>
            <td className="px-3 py-2.5 text-right text-slate-600">
              {formatNumber(row.consumption_kwh, 1)}
            </td>
            {METHOD_ORDER.map((method) => {
              const value = row.methods?.[method];
              return (
                <td
                  key={method}
                  className="px-3 py-2.5 text-right text-slate-700"
                  title={
                    value
                      ? `${formatPercent(value.coverage_percentage)} coverage · ₹${formatNumber(value.estimated_credit, 0)} credit`
                      : "No value"
                  }
                >
                  {value ? formatNumber(value.allocated_kwh, 2) : "—"}
                </td>
              );
            })}
            <td className="px-3 py-2.5 text-right font-medium text-slate-800">
              {formatNumber(row.allocation_spread_kwh, 3)}
            </td>
            <td className="px-5 py-2.5 text-right text-slate-600">
              {formatPercent(row.coverage_spread_percentage, 2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CoveragePill({ value }) {
  const numeric = Number(value) || 0;
  const tone =
    numeric >= 75
      ? "bg-emerald-50 text-emerald-700"
      : numeric >= 40
        ? "bg-forest-50 text-forest-700"
        : numeric >= 20
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {formatPercent(value)}
    </span>
  );
}
