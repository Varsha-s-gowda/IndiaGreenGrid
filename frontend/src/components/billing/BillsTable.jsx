import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, FileText } from "lucide-react";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { useNotifications } from "../../context/NotificationContext";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCurrency,
  formatEnergy,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { downloadBillPdf } from "../../services/billingService";
import BillStatusBadge from "./BillStatusBadge";

export default function BillsTable({
  bills = [],
  showPeriod = true,
  emptyTitle = "No bills yet",
  emptyDescription = "Generate bills from the BillFair workspace to see statements here.",
}) {
  const { notify } = useNotifications();
  const [downloading, setDownloading] = useState(null);

  async function handlePdf(bill) {
    setDownloading(bill.id);
    try {
      await downloadBillPdf(bill.id, bill.bill_number);
    } catch (error) {
      notify({
        title: "PDF download failed",
        message: getApiErrorMessage(error, "Unable to download the bill PDF."),
        type: "error",
        source: "BillFair",
      });
    } finally {
      setDownloading(null);
    }
  }

  if (!bills.length) {
    return (
      <EmptyState
        icon={FileText}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2.5 pr-4 font-medium">Flat</th>
            {showPeriod && <th className="py-2.5 pr-4 font-medium">Period</th>}
            <th className="py-2.5 pr-4 text-right font-medium">Consumption</th>
            <th className="py-2.5 pr-4 text-right font-medium">Solar</th>
            <th className="py-2.5 pr-4 text-right font-medium">Coverage</th>
            <th className="py-2.5 pr-4 text-right font-medium">Net payable</th>
            <th className="py-2.5 pr-4 text-right font-medium">Savings</th>
            <th className="py-2.5 pr-4 font-medium">Status</th>
            <th className="py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bills.map((bill) => (
            <tr key={`${bill.id ?? bill.apartment_id}-${bill.version}`} className="hover:bg-slate-50/60">
              <td className="py-3 pr-4">
                <p className="font-semibold text-slate-800">
                  {bill.apartment?.flat_number || "—"}
                </p>
                <p className="text-[11px] text-slate-500">
                  v{bill.version} · {bill.bill_number || "preview"}
                </p>
              </td>
              {showPeriod && (
                <td className="py-3 pr-4 text-slate-600">
                  <p>{bill.billing_period_label}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatUtcDate(bill.billing_period_start)} –{" "}
                    {formatUtcDate(bill.billing_period_end)}
                  </p>
                </td>
              )}
              <td className="py-3 pr-4 text-right text-slate-600">
                {formatEnergy(bill.consumption_kwh, 2)}
              </td>
              <td className="py-3 pr-4 text-right text-slate-600">
                {formatEnergy(bill.solar_allocation_kwh, 2)}
              </td>
              <td className="py-3 pr-4 text-right text-slate-600">
                {formatPercent(bill.solar_coverage_percentage, 2)}
              </td>
              <td className="py-3 pr-4 text-right font-semibold text-slate-800">
                {formatCurrency(bill.net_payable)}
              </td>
              <td className="py-3 pr-4 text-right text-emerald-700">
                {formatCurrency(bill.estimated_savings)}
              </td>
              <td className="py-3 pr-4">
                <BillStatusBadge
                  status={bill.status}
                  isCurrent={bill.is_current}
                />
              </td>
              <td className="py-3">
                <div className="flex items-center justify-end gap-1.5">
                  {bill.id ? (
                    <>
                      <Link
                        to={`/billing/bills/${bill.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        View
                        <ArrowRight size={12} />
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePdf(bill)}
                        loading={downloading === bill.id}
                        title="Download PDF statement"
                      >
                        <Download size={13} />
                      </Button>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">Not saved</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
