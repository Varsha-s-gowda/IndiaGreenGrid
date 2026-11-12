import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import ExportButton from "../../components/platform/ExportButton";
import Modal from "../../components/platform/Modal";
import Pagination from "../../components/platform/Pagination";
import { SampleNotice, StatusBadge, labelForToken } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import { EMPLOYMENT_TYPES, titleCaseToken } from "../../lib/constants";
import { formatDate, formatNumber } from "../../lib/formatters";
import {
  applyToJob,
  getJob,
  getJobs,
  getMyApplications,
} from "../../services/platformService";

function salaryRange(job) {
  if (job.salary_min === null && job.salary_max === null) return "Salary not disclosed";
  const fmt = (value) =>
    value === null || value === undefined
      ? "—"
      : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
  return `${fmt(job.salary_min)} – ${fmt(job.salary_max)} / year`;
}

function JobDetail({ jobId, onClose, onApplied }) {
  const { notify } = useNotifications();
  const { data, loading, error, reload } = useApiData(
    () => getJob(jobId),
    [jobId],
    { enabled: Boolean(jobId) }
  );
  const [coverNote, setCoverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applyError, setApplyError] = useState("");

  useEffect(() => {
    setCoverNote("");
    setApplyError("");
  }, [jobId]);

  async function handleApply(event) {
    event.preventDefault();
    setSubmitting(true);
    setApplyError("");
    try {
      await applyToJob(jobId, { cover_note: coverNote });
      notify({
        type: "success",
        title: "Application submitted",
        message: "Your application was recorded on the platform.",
        source: "Green jobs",
      });
      reload();
      onApplied?.();
    } catch (requestError) {
      setApplyError(getApiErrorMessage(requestError, "Unable to submit the application."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={Boolean(jobId)}
      onClose={onClose}
      title={data?.title || "Job details"}
      description={data ? `${data.organization} · ${data.location}` : "Loading listing…"}
      wide
    >
      {loading && !data ? (
        <div className="space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : error ? (
        <ErrorState compact title="Job unavailable" message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="forest">{data.category}</Badge>
            <Badge variant="neutral">{titleCaseToken(data.employment_type)}</Badge>
            <Badge variant="neutral">{titleCaseToken(data.experience_level)} level</Badge>
            <StatusBadge value={data.verification_status} />
            <StatusBadge value={data.listing_status} />
          </div>
          {(data.verification_status !== "VERIFIED_EXTERNAL" || data.source_name) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
              <p>
                <span className="font-semibold text-slate-700">Source:</span>{" "}
                {data.source_name || "Not recorded"}
                {data.source_url && (
                  <>
                    {" · "}
                    <a href={data.source_url} target="_blank" rel="noreferrer" className="font-medium text-forest-700 hover:underline">
                      open source ↗
                    </a>
                  </>
                )}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Verification:</span>{" "}
                {labelForToken(data.verification_status)}
                {data.expires_at ? ` · expires ${formatDate(data.expires_at)}` : " · no expiry recorded"}
              </p>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-500">Salary</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800">{salaryRange(data)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-500">Location</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800">{data.location}, {data.state}</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-500">Posted</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-800">{formatDate(data.posted_at)}</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-800">Role description</h3>
            <p className="mt-1 text-xs leading-6 text-slate-600">{data.description}</p>
          </div>
          {data.eligibility && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Eligibility</h3>
              <p className="mt-1 text-xs leading-6 text-slate-600">{data.eligibility}</p>
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold text-slate-800">Skills</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(data.skills || []).map((skill) => (
                <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {data.application ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <div className="text-[11px] leading-5 text-emerald-800">
                <p className="font-semibold">Application already submitted</p>
                <p>Status: {titleCaseToken(data.application.status)} · {formatDate(data.application.applied_at)}</p>
                {data.application.cover_note && <p className="mt-1 italic">“{data.application.cover_note}”</p>}
              </div>
            </div>
          ) : (
            <form onSubmit={handleApply} className="space-y-2.5">
              {applyError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                  {applyError}
                </p>
              )}
              <label className="block">
                <span className="field-label">Cover note (optional)</span>
                <textarea
                  className="field h-24 py-2"
                  maxLength={2000}
                  value={coverNote}
                  onChange={(event) => setCoverNote(event.target.value)}
                  placeholder="Tell the employer why this role fits your experience."
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" loading={submitting}>
                  <Send size={13} />
                  Apply on platform
                </Button>
                {data.application_url && (
                  <a href={data.application_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink size={13} />
                      External listing
                    </Button>
                  </a>
                )}
              </div>
            </form>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

export default function JobsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [location, setLocation] = useState("All");
  const [employmentType, setEmploymentType] = useState("All");
  const [verification, setVerification] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState(null);

  const applications = useApiData(getMyApplications, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [category, location, employmentType, verification]);

  const { data, loading, error, reload } = useApiData(
    () =>
      getJobs({
        search,
        category,
        location,
        employment_type: employmentType,
        verification_status: verification,
        page,
        page_size: 9,
      }),
    [search, category, location, employmentType, verification, page]
  );

  const exportRows = useMemo(
    () =>
      (data?.items || []).map((job) => ({
        title: job.title,
        organization: job.organization,
        category: job.category,
        location: job.location,
        state: job.state,
        employment_type: job.employment_type,
        experience_level: job.experience_level,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        verification_status: job.verification_status,
        listing_status: job.listing_status,
        source_name: job.source_name,
        expires_at: job.expires_at,
        posted_at: job.posted_at,
      })),
    [data]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D4 · Opportunities"
        icon={BriefcaseBusiness}
        title="Green jobs portal"
        description="Search renewable-energy, circular-economy and sustainability roles. Applications are recorded on the platform."
        actions={
          <>
            <ExportButton rows={exportRows} filename="green-jobs.csv" />
            <Button variant="outline" size="sm" onClick={reload} loading={loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
          </>
        }
      />

      {data?.is_sample && (
        <SampleNotice title="Sample opportunity catalogue">
          No externally verified listings are available yet. These roles are
          demonstration records and are not live vacancies — always confirm on
          the employer's own careers page before applying.
        </SampleNotice>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Matching listings"
          value={formatNumber(data?.total, 0)}
          detail={`${formatNumber(data?.verification_summary?.verified_external, 0)} externally verified`}
          icon={BriefcaseBusiness}
          loading={loading}
        />
        <StatCard
          label="Your applications"
          value={formatNumber(applications.data?.total, 0)}
          detail="Recorded on this platform"
          icon={Send}
          tone="sky"
          loading={applications.loading}
        />
        <StatCard
          label="Categories"
          value={formatNumber(data?.facets?.categories?.length, 0)}
          detail="Green skills and sectors"
          icon={Building2}
          tone="amber"
          loading={loading}
        />
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search title, organisation, skill…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search green jobs"
              />
            </div>
            <select className="field h-9 w-auto text-xs" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter category">
              <option value="All">All categories</option>
              {(data?.facets?.categories || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="field h-9 w-auto text-xs" value={location} onChange={(event) => setLocation(event.target.value)} aria-label="Filter location">
              <option value="All">All locations</option>
              {(data?.facets?.locations || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="field h-9 w-auto text-xs" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} aria-label="Filter employment type">
              <option value="All">All types</option>
              {(data?.facets?.employment_types || EMPLOYMENT_TYPES).map((item) => (
                <option key={item} value={item}>{titleCaseToken(item)}</option>
              ))}
            </select>
            <select className="field h-9 w-auto text-xs" value={verification} onChange={(event) => setVerification(event.target.value)} aria-label="Filter verification status">
              <option value="All">All verification</option>
              {(data?.facets?.verification_statuses || ["VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"]).map((item) => (
                <option key={item} value={item}>{labelForToken(item)}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {error ? (
        <ErrorState title="Jobs unavailable" message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : (data?.items || []).length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJob(job.id)}
                className="premium-card group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-card transition hover:border-forest-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-forest-700">{job.organization}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{job.title}</h3>
                  </div>
                  {job.has_applied && <Badge variant="success">Applied</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="neutral">{job.category}</Badge>
                  <Badge variant="neutral">{titleCaseToken(job.employment_type)}</Badge>
                  <StatusBadge value={job.verification_status} />
                  {job.listing_status === "EXPIRED" && <StatusBadge value="EXPIRED" />}
                </div>
                <p className="mt-3 line-clamp-3 flex-1 text-xs leading-5 text-slate-500">{job.description}</p>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <p className="flex items-center gap-1.5"><MapPin size={12} />{job.location}, {job.state}</p>
                  <p className="font-medium text-slate-700">{salaryRange(job)}</p>
                  <p className="text-[10px] text-slate-400">
                    {job.source_name || "Source not recorded"}
                    {job.days_until_expiry !== null && job.days_until_expiry !== undefined
                      ? ` · expires in ${job.days_until_expiry}d`
                      : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} label="jobs" />
          <p className="text-[11px] leading-5 text-slate-500">{data.disclaimer}</p>
        </>
      ) : (
        <Card>
          <CardBody className="py-10 text-center">
            <BriefcaseBusiness size={28} className="mx-auto text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-700">No jobs match these filters</h3>
            <p className="mt-1 text-xs text-slate-500">Try clearing the search or choosing a different category.</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your applications"
          description="Applications recorded through the platform."
          icon={CheckCircle2}
          action={<Badge variant="neutral">{applications.data?.total || 0} total</Badge>}
        />
        <CardBody>
          {applications.loading ? (
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
          ) : (applications.data?.items || []).length ? (
            <div className="space-y-2">
              {applications.data.items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">{item.job_title}</p>
                    <p className="text-[10px] text-slate-500">{item.organization} · {formatDate(item.applied_at)}</p>
                  </div>
                  <Badge variant="success">{titleCaseToken(item.status)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">You have not applied to any roles yet.</p>
          )}
          {applications.error && (
            <p className="mt-2 text-[11px] text-rose-600">{applications.error}</p>
          )}
        </CardBody>
      </Card>

      <JobDetail
        jobId={selectedJob}
        onClose={() => setSelectedJob(null)}
        onApplied={() => {
          reload();
          applications.reload();
        }}
      />
    </div>
  );
}
