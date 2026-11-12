import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  Search,
  Undo2,
  XCircle,
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
  DocumentPanel,
  Field,
  NoteBanner,
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../lib/formatters";
import {
  decideLoanApplication,
  getInstitutionLoanSummary,
  getLoanApplication,
  getLoanApplications,
  resubmitLoanApplication,
  withdrawLoanApplication,
} from "../../services/ecosystemService";

const STATUS_OPTIONS = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "DOCUMENTS_REQUESTED",
  "DOCUMENTS_RESUBMITTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
];

const DECISIONS = {
  SUBMITTED: ["UNDER_REVIEW", "DOCUMENTS_REQUESTED", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["DOCUMENTS_REQUESTED", "APPROVED", "REJECTED"],
  DOCUMENTS_REQUESTED: ["UNDER_REVIEW", "REJECTED"],
  DOCUMENTS_RESUBMITTED: [
    "UNDER_REVIEW",
    "DOCUMENTS_REQUESTED",
    "APPROVED",
    "REJECTED",
  ],
};

function LoanApplicationDetail({
  applicationId,
  role,
  onClose,
  onChanged,
}) {
  const { data: application, loading, error, reload } = useApiData(
    () => getLoanApplication(applicationId),
    [applicationId],
    { enabled: Boolean(applicationId) }
  );
  const action = useAction();
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState({ status: "UNDER_REVIEW", note: "" });
  const [decisionError, setDecisionError] = useState("");
  const [busy, setBusy] = useState(false);

  const isApplicant = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const canDecide = ["FINANCIAL_INSTITUTION", "ADMIN"].includes(role);
  const options = application
    ? DECISIONS[application.status] || []
    : [];
  const needsNote = ["APPROVED", "REJECTED"].includes(decision.status);

  async function run(task) {
    await action.run("action", task);
    reload();
    onChanged?.();
  }

  async function submitDecision(event) {
    event.preventDefault();
    if (needsNote && !decision.note.trim()) {
      setDecisionError("A decision note is required for approvals and rejections.");
      return;
    }
    setDecisionError("");
    setBusy(true);
    try {
      await decideLoanApplication(applicationId, {
        status: decision.status,
        note: decision.note.trim(),
      });
      setDecisionOpen(false);
      setDecision({ status: "UNDER_REVIEW", note: "" });
      reload();
      onChanged?.();
    } catch (error_) {
      setDecisionError(error_?.message || "The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(applicationId)}
      onClose={onClose}
      wide
      title={application?.reference || "Loan application"}
      description={
        application
          ? `${application.product_name || "Green loan"} · ${formatCurrency(
              application.loan_amount
            )}`
          : "Loading application"
      }
      footer={
        application ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Submitted{" "}
              {application.submitted_at
                ? formatDateTime(application.submitted_at)
                : formatDate(application.created_at)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {isApplicant &&
                ["DOCUMENTS_REQUESTED", "SUBMITTED"].includes(
                  application.status
                ) && (
                  <Button
                    size="sm"
                    loading={action.busy === "action"}
                    onClick={() =>
                      run(() => resubmitLoanApplication(applicationId))
                    }
                  >
                    <FileCheck2 size={13} /> Resubmit documents
                  </Button>
                )}
              {isApplicant &&
                !["APPROVED", "REJECTED", "WITHDRAWN"].includes(
                  application.status
                ) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(() => withdrawLoanApplication(applicationId))
                    }
                  >
                    <Undo2 size={13} /> Withdraw
                  </Button>
                )}
              {canDecide && options.length > 0 && (
                <Button size="sm" onClick={() => setDecisionOpen(true)}>
                  <CheckCircle2 size={13} /> Record decision
                </Button>
              )}
            </div>
          </div>
        ) : null
      }
    >
      {loading && !application ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState
          compact
          title="Application unavailable"
          message={error}
          onRetry={reload}
        />
      ) : application ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={application.status} />
            <Badge variant="forest">
              {application.product_name || "Green loan"}
            </Badge>
            <Badge variant="neutral">{formatCurrency(application.loan_amount)}</Badge>
          </div>

          <DetailGrid
            rows={[
              ["Applicant", application.citizen?.name || "—"],
              ["Applicant email", application.citizen?.email || "—"],
              ["Institution", application.institution?.organization || application.institution?.name || "—"],
              ["Purpose", application.project_purpose],
              ["Location", application.location || "—"],
              ["State", application.state || "—"],
              [
                "Submitted",
                application.submitted_at
                  ? formatDateTime(application.submitted_at)
                  : "—",
              ],
              [
                "Reviewed",
                application.reviewed_at
                  ? formatDateTime(application.reviewed_at)
                  : "—",
              ],
              [
                "Decided",
                application.decided_at
                  ? formatDateTime(application.decided_at)
                  : "—",
              ],
              [
                "Interest range",
                application.product
                  ? `${application.product.interest_rate_min}% – ${application.product.interest_rate_max}%`
                  : "—",
              ],
            ]}
          />

          {(application.review_note || application.decision_note) && (
            <NoteBanner
              tone={application.status === "REJECTED" ? "danger" : "info"}
              title="Institution note"
            >
              {application.decision_note || application.review_note}
            </NoteBanner>
          )}

          {action.error && (
            <NoteBanner tone="danger" title="Action failed">
              {action.error}
            </NoteBanner>
          )}

          <DocumentPanel
            entityType="LOAN_APPLICATION"
            entityId={application.id}
            canUpload={isApplicant}
            canReview={canDecide}
            documentTypes={[
              "IDENTITY_PROOF",
              "ADDRESS_PROOF",
              "INCOME_PROOF",
              "SOLAR_QUOTATION",
              "SUPPORTING",
            ]}
            description="Applicant documents are visible to the selected institution and administrators."
          />

          <Modal
            open={decisionOpen}
            onClose={() => setDecisionOpen(false)}
            title="Record loan decision"
            description={`For ${application.reference}`}
          >
            <form className="space-y-3" onSubmit={submitDecision}>
              <Field label="Decision">
                <select
                  className="field mt-1 h-9 w-full text-xs"
                  value={decision.status}
                  onChange={(event) => {
                    setDecision({ ...decision, status: event.target.value });
                    setDecisionError("");
                  }}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {titleCaseToken(option)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Decision note"
                hint={
                  needsNote
                    ? "Required for approvals and rejections."
                    : "Shared with the applicant as a workflow notification."
                }
              >
                <textarea
                  className="field mt-1 min-h-[110px] w-full text-xs"
                  value={decision.note}
                  onChange={(event) => {
                    setDecision({ ...decision, note: event.target.value });
                    setDecisionError("");
                  }}
                />
              </Field>
              {decisionError && (
                <p className="text-[11px] text-rose-600">{decisionError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDecisionOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy}>
                  Save decision
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      ) : null}
    </Modal>
  );
}

export default function LoanApplicationsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isApplicant = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const canDecide = ["FINANCIAL_INSTITUTION", "ADMIN"].includes(role);
  const isFinancier = role === "FINANCIAL_INSTITUTION";

  const [status, setStatus] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);

  const applications = useApiData(
    () =>
      getLoanApplications({
        status: status === "All" ? undefined : status,
        search,
        page,
        pageSize: 10,
      }),
    [status, search, page]
  );
  const summary = useApiData(getInstitutionLoanSummary, [], {
    enabled: isFinancier,
  });

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const items = applications.data?.items || [];
  const statusSummary = useMemo(() => {
    const counts = {};
    items.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [items]);

  const pipeline = summary.data || {};

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow C · applications"
        icon={ClipboardList}
        title={canDecide ? "Loan applications" : "My green loan applications"}
        description={
          canDecide
            ? "Review applicant documents, request missing evidence and record lending decisions."
            : "Track your application status, upload requested documents and respond to lenders."
        }
        actions={
          <>
            {isApplicant && (
              <Link to="/loans">
                <Button size="sm" variant="outline">
                  Loan marketplace
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={applications.reload}
              loading={applications.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {isFinancier && summary.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Applications", pipeline.applications ?? 0],
            ["Awaiting review", (pipeline.by_status || {}).SUBMITTED ?? 0],
            ["Approved", (pipeline.by_status || {}).APPROVED ?? 0],
            ["Approved value", formatCurrency(pipeline.approved_amount ?? 0)],
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

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search reference, purpose or location…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search loan applications"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter application status"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {canDecide && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["SUBMITTED", "DOCUMENTS_REQUESTED", "APPROVED"].map((key) => (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {titleCaseToken(key)}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {statusSummary[key] || 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {applications.error ? (
        <ErrorState
          title="Loan applications unavailable"
          message={applications.error}
          onRetry={applications.reload}
        />
      ) : applications.loading && !applications.data ? (
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
      ) : items.length ? (
        <>
          <Card>
            <CardHeader
              title="Application pipeline"
              description="Records are scoped to your role and organisation."
              icon={ClipboardList}
            />
            <CardBody>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[840px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Reference</th>
                      <th className="pb-2 font-semibold">Applicant</th>
                      <th className="pb-2 font-semibold">Product</th>
                      <th className="pb-2 text-right font-semibold">Amount</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Submitted</th>
                      <th className="pb-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((application) => (
                      <tr
                        key={application.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5">
                          <p className="font-medium text-slate-800">
                            {application.reference}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {application.project_purpose}
                          </p>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {application.citizen?.name || "—"}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {application.product_name || "—"}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800">
                          {formatCurrency(application.loan_amount)}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge value={application.status} />
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {application.submitted_at
                            ? formatDate(application.submitted_at)
                            : formatDate(application.created_at)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailId(application.id)}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={applications.data.page}
                pages={applications.data.pages}
                total={applications.data.total}
                onChange={setPage}
                label="applications"
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No loan applications"
          description={
            isApplicant
              ? "Compare green loan products and submit an application to a verified lender."
              : "Applications assigned to your institution will appear here."
          }
          action={
            isApplicant ? (
              <Link to="/loans">
                <Button size="sm" variant="outline">
                  Browse loan products
                </Button>
              </Link>
            ) : null
          }
        />
      )}

      <LoanApplicationDetail
        applicationId={detailId}
        role={role}
        onClose={() => setDetailId(null)}
        onChanged={applications.reload}
      />
    </div>
  );
}
