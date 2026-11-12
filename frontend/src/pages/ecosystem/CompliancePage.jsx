import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileCheck2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import Modal from "../../components/platform/Modal";
import Pagination from "../../components/platform/Pagination";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import {
  DetailGrid,
  Field,
  NoteBanner,
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import {
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  createComplianceRecord,
  getComplianceRecords,
  getComplianceSummary,
  reviewComplianceRecord,
  submitComplianceRecord,
  updateComplianceRecord,
} from "../../services/ecosystemService";

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "REVISION_REQUIRED",
];

const REVIEW_OPTIONS = [
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "REVISION_REQUIRED",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function emptyRecord(user) {
  const now = new Date();
  return {
    entity_name: user?.organization || "",
    state: user?.state || "Maharashtra",
    period_year: now.getFullYear(),
    period_month: now.getMonth() + 1,
    obligated_energy_mwh: "",
    solar_mwh: "",
    wind_mwh: "",
    hydro_mwh: "",
    other_mwh: "",
    rpo_target_pct: "",
    notes: "",
  };
}

export default function CompliancePage() {
  const { user } = useAuth();
  const role = user?.role;
  const canFile = ["DISCOM", "INDUSTRY"].includes(role);
  const isAdmin = role === "ADMIN";

  const [status, setStatus] = useState("All");
  const [year, setYear] = useState("All");
  const [month, setMonth] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyRecord(user));
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [review, setReview] = useState({ status: "VERIFIED", note: "" });
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const action = useAction();

  const records = useApiData(
    () =>
      getComplianceRecords({
        status: status === "All" ? undefined : status,
        year: year === "All" ? undefined : Number(year),
        month: month === "All" ? undefined : Number(month),
        search,
        page,
        pageSize: 10,
      }),
    [status, year, month, search, page]
  );
  const summary = useApiData(getComplianceSummary, []);

  const items = records.data?.items || [];
  const totals = summary.data?.totals || {};
  const trend = summary.data?.trend || [];
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    new Set([
      currentYear,
      currentYear - 1,
      currentYear - 2,
      ...items.map((item) => item.period_year),
    ])
  ).sort((a, b) => b - a);

  const statusCounts = useMemo(() => {
    const counts = {};
    items.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [items]);

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyRecord(user));
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(record) {
    setEditing(record);
    setForm({
      entity_name: record.entity_name,
      state: record.state,
      period_year: record.period_year,
      period_month: record.period_month,
      obligated_energy_mwh: record.obligated_energy_mwh,
      solar_mwh: record.solar_mwh,
      wind_mwh: record.wind_mwh,
      hydro_mwh: record.hydro_mwh,
      other_mwh: record.other_mwh,
      rpo_target_pct: record.rpo_target_pct,
      notes: record.notes || "",
    });
    setFormError("");
    setFormOpen(true);
  }

  function payload() {
    return {
      ...form,
      period_year: Number(form.period_year),
      period_month: Number(form.period_month),
      obligated_energy_mwh: Number(form.obligated_energy_mwh),
      solar_mwh: Number(form.solar_mwh || 0),
      wind_mwh: Number(form.wind_mwh || 0),
      hydro_mwh: Number(form.hydro_mwh || 0),
      other_mwh: Number(form.other_mwh || 0),
      rpo_target_pct: Number(form.rpo_target_pct),
    };
  }

  async function submitRecord(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await updateComplianceRecord(editing.id, payload());
      } else {
        await createComplianceRecord(payload());
      }
      setFormOpen(false);
      setEditing(null);
      records.reload();
      summary.reload();
    } catch (error) {
      setFormError(error?.message || "The compliance record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview(record) {
    await action.run("submit", () => submitComplianceRecord(record.id));
    records.reload();
    summary.reload();
  }

  async function submitReview(event) {
    event.preventDefault();
    setReviewBusy(true);
    setReviewError("");
    try {
      await reviewComplianceRecord(reviewing.id, {
        status: review.status,
        note: review.note,
      });
      setReviewing(null);
      records.reload();
      summary.reload();
    } catch (error) {
      setReviewError(error?.message || "The review decision could not be saved.");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow E · compliance"
        icon={FileCheck2}
        title={
          canFile
            ? "Monthly RPO filings"
            : isAdmin
              ? "Compliance verification"
              : "Verified RPO compliance"
        }
        description={
          canFile
            ? "File monthly renewable purchase obligation evidence and respond to review notes."
            : isAdmin
              ? "Review DISCOM and industry filings, request revisions or verify records."
              : "Only administrator-verified RPO filings are shown here."
        }
        actions={
          <>
            {canFile && (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> New filing
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                records.reload();
                summary.reload();
              }}
              loading={records.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {summary.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Records", formatNumber(totals.records, 0)],
            ["Obligated", `${formatNumber(totals.obligated_mwh, 1)} MWh`],
            ["Renewable", `${formatNumber(totals.actual_mwh, 1)} MWh`],
            ["Compliance", formatPercent(totals.compliance_pct, 1)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {summary.data?.note && (
        <NoteBanner title="Workflow provenance">{summary.data.note}</NoteBanner>
      )}

      {action.error && (
        <NoteBanner tone="danger" title="Action failed">
          {action.error}
        </NoteBanner>
      )}

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search entity or state…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search compliance records"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter compliance status"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
              aria-label="Filter compliance year"
            >
              <option value="All">All years</option>
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(1);
              }}
              aria-label="Filter compliance month"
            >
              <option value="All">All months</option>
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {isAdmin && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].map((key) => (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {titleCaseToken(key)}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {statusCounts[key] || 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {records.error ? (
        <ErrorState
          title="Compliance records unavailable"
          message={records.error}
          onRetry={records.reload}
        />
      ) : records.loading && !records.data ? (
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
      ) : items.length ? (
        <>
          <Card>
            <CardHeader
              title="Filing register"
              description="Required energy is derived from the RPO target and reported renewable procurement."
              icon={ShieldCheck}
            />
            <CardBody>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Entity</th>
                      <th className="pb-2 font-semibold">Period</th>
                      <th className="pb-2 text-right font-semibold">Obligated</th>
                      <th className="pb-2 text-right font-semibold">Renewable</th>
                      <th className="pb-2 text-right font-semibold">Shortfall</th>
                      <th className="pb-2 text-right font-semibold">Compliance</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((record) => (
                      <tr
                        key={record.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5">
                          <p className="font-medium text-slate-800">
                            {record.entity_name}
                          </p>
                          <p className="text-[10px] text-slate-400">{record.state}</p>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {MONTHS[record.period_month - 1]} {record.period_year}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(record.obligated_energy_mwh, 1)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(record.actual_renewable_mwh, 1)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(record.shortfall_mwh, 1)}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800">
                          {formatPercent(record.compliance_pct, 1)}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge value={record.status} />
                        </td>
                        <td className="py-2.5">
                          <div className="flex justify-end gap-1">
                            {canFile &&
                              record.owner_id === user?.id &&
                              ["DRAFT", "REVISION_REQUIRED", "REJECTED"].includes(
                                record.status
                              ) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openEdit(record)}
                                  >
                                    <Pencil size={12} /> Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    loading={action.busy === "submit"}
                                    onClick={() => submitForReview(record)}
                                  >
                                    <Send size={12} /> Submit
                                  </Button>
                                </>
                              )}
                            {isAdmin &&
                              ["SUBMITTED", "UNDER_REVIEW"].includes(
                                record.status
                              ) && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setReviewing(record);
                                    setReview({
                                      status: "VERIFIED",
                                      note: "",
                                    });
                                    setReviewError("");
                                  }}
                                >
                                  <CheckCircle2 size={12} /> Review
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={records.data.page}
                pages={records.data.pages}
                total={records.data.total}
                onChange={setPage}
                label="filings"
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={FileCheck2}
          title="No compliance filings"
          description={
            canFile
              ? "Create your first monthly RPO filing and submit it for administrator verification."
              : "Verified filings will appear here after administrator review."
          }
          action={
            canFile ? (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> New filing
              </Button>
            ) : null
          }
        />
      )}

      {trend.length > 0 && (
        <Card>
          <CardHeader
            title="Compliance trend"
            description="Monthly totals computed from records in your scope."
            icon={CheckCircle2}
          />
          <CardBody>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Period</th>
                    <th className="pb-2 text-right font-semibold">Obligated</th>
                    <th className="pb-2 text-right font-semibold">Required</th>
                    <th className="pb-2 text-right font-semibold">Actual</th>
                    <th className="pb-2 text-right font-semibold">Shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
                    <tr
                      key={row.period}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="py-2 font-medium text-slate-700">{row.period}</td>
                      <td className="py-2 text-right text-slate-600">
                        {formatNumber(row.obligated_mwh, 1)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatNumber(row.required_mwh, 1)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatNumber(row.actual_mwh, 1)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatNumber(row.shortfall_mwh, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit compliance filing" : "New monthly RPO filing"}
        description="Save a draft, then submit it for administrator verification."
        wide
      >
        <form className="space-y-3" onSubmit={submitRecord}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entity name">
              <input
                className="field mt-1 h-9 w-full text-xs"
                required
                minLength={2}
                value={form.entity_name}
                onChange={(event) =>
                  setForm({ ...form, entity_name: event.target.value })
                }
              />
            </Field>
            <Field label="State">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
              >
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.period_year}
                onChange={(event) =>
                  setForm({ ...form, period_year: event.target.value })
                }
              >
                {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Month">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.period_month}
                onChange={(event) =>
                  setForm({ ...form, period_month: event.target.value })
                }
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Obligated energy (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.obligated_energy_mwh}
                onChange={(event) =>
                  setForm({ ...form, obligated_energy_mwh: event.target.value })
                }
              />
            </Field>
            <Field label="RPO target (%)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.rpo_target_pct}
                onChange={(event) =>
                  setForm({ ...form, rpo_target_pct: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Solar (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                value={form.solar_mwh}
                onChange={(event) =>
                  setForm({ ...form, solar_mwh: event.target.value })
                }
              />
            </Field>
            <Field label="Wind (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                value={form.wind_mwh}
                onChange={(event) =>
                  setForm({ ...form, wind_mwh: event.target.value })
                }
              />
            </Field>
            <Field label="Hydro (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                value={form.hydro_mwh}
                onChange={(event) =>
                  setForm({ ...form, hydro_mwh: event.target.value })
                }
              />
            </Field>
            <Field label="Other (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                value={form.other_mwh}
                onChange={(event) =>
                  setForm({ ...form, other_mwh: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Filing notes">
            <textarea
              className="field mt-1 min-h-[90px] w-full text-xs"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
          {formError && <NoteBanner tone="danger">{formError}</NoteBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {editing ? "Save changes" : "Save draft"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review compliance filing"
        description={
          reviewing
            ? `${reviewing.entity_name} · ${MONTHS[reviewing.period_month - 1]} ${
                reviewing.period_year
              }`
            : ""
        }
      >
        {reviewing && (
          <div className="space-y-3">
            <DetailGrid
              rows={[
                [
                  "Required",
                  `${formatNumber(reviewing.required_mwh, 1)} MWh`,
                ],
                [
                  "Reported renewable",
                  `${formatNumber(reviewing.actual_renewable_mwh, 1)} MWh`,
                ],
                [
                  "Compliance",
                  formatPercent(reviewing.compliance_pct, 1),
                ],
                [
                  "Shortfall",
                  `${formatNumber(reviewing.shortfall_mwh, 1)} MWh`,
                ],
              ]}
            />
            <form className="space-y-3" onSubmit={submitReview}>
              <Field label="Decision">
                <select
                  className="field mt-1 h-9 w-full text-xs"
                  value={review.status}
                  onChange={(event) =>
                    setReview({ ...review, status: event.target.value })
                  }
                >
                  {REVIEW_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {titleCaseToken(option)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Review note">
                <textarea
                  className="field mt-1 min-h-[90px] w-full text-xs"
                  value={review.note}
                  onChange={(event) =>
                    setReview({ ...review, note: event.target.value })
                  }
                />
              </Field>
              {reviewError && <NoteBanner tone="danger">{reviewError}</NoteBanner>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReviewing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={reviewBusy}>
                  Save decision
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
