import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  GitCompare,
  IndianRupee,
  Landmark,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import ExportButton from "../../components/platform/ExportButton";
import Modal from "../../components/platform/Modal";
import Pagination from "../../components/platform/Pagination";
import { SampleNotice, StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import useApiData from "../../hooks/useApiData";
import { titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  compareFinanceSchemes,
  getFinanceScheme,
  getFinanceSchemes,
} from "../../services/platformService";

function tenureLabel(scheme) {
  if (scheme.tenure_months_min === null && scheme.tenure_months_max === null) return "Not specified";
  return `${scheme.tenure_months_min ?? "—"}–${scheme.tenure_months_max ?? "—"} months`;
}

function rateLabel(scheme) {
  if (scheme.interest_rate_min === null && scheme.interest_rate_max === null) return "Not applicable";
  if (scheme.interest_rate_min === scheme.interest_rate_max) {
    return `${formatPercent(scheme.interest_rate_min, 2)} p.a.`;
  }
  return `${formatPercent(scheme.interest_rate_min, 2)} – ${formatPercent(scheme.interest_rate_max, 2)} p.a.`;
}

function SchemeDetail({ schemeId, onClose }) {
  const { data, loading, error } = useApiData(
    () => getFinanceScheme(schemeId),
    [schemeId],
    { enabled: Boolean(schemeId) }
  );

  return (
    <Modal
      open={Boolean(schemeId)}
      onClose={onClose}
      title={data?.name || "Finance scheme"}
      description={data?.provider}
      wide
    >
      {loading && !data ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState compact title="Scheme unavailable" message={error} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="forest">{titleCaseToken(data.scheme_type)}</Badge>
            <Badge variant="neutral">{data.category}</Badge>
            <StatusBadge value={data.verification_status} />
            {data.rate_verified ? (
              <Badge variant="success"><CheckCircle2 size={11} /> Rate verified</Badge>
            ) : (
              <Badge variant="warning"><ShieldAlert size={11} /> Rate unverified</Badge>
            )}
          </div>

          <p className="text-xs leading-6 text-slate-600">{data.description}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Interest rate", rateLabel(data)],
              ["Tenure", tenureLabel(data)],
              ["Maximum amount", data.max_amount ? formatCurrency(data.max_amount) : "Not specified"],
              ["Last verified", data.last_verified_at ? formatDate(data.last_verified_at) : "Not recorded"],
              ["Rate note", data.rate_note || "No verification note provided"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {[
            ["Eligibility", data.eligibility],
            ["Benefits", data.benefits],
            ["Limitations", data.limitations || "No limitations recorded."],
          ].map(([label, value]) => (
            <div key={label}>
              <h3 className="text-xs font-semibold text-slate-800">{label}</h3>
              <p className="mt-1 text-xs leading-6 text-slate-600">{value}</p>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {data.application_url && (
              <a href={data.application_url} target="_blank" rel="noreferrer">
                <Button size="sm">
                  <ArrowUpRight size={13} />
                  Provider application
                </Button>
              </a>
            )}
            {data.source_url && (
              <a href={data.source_url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ArrowUpRight size={13} />
                  Source
                </Button>
              </a>
            )}
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            The platform does not calculate eligibility, underwriting or loan approval.
            Confirm all terms directly with the provider.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function ComparePanel({ ids, onClear }) {
  const { data, loading, error } = useApiData(
    () => (ids.length >= 2 ? compareFinanceSchemes(ids) : Promise.resolve(null)),
    [ids.join(",")],
    { enabled: ids.length >= 2 }
  );

  if (ids.length < 2) return null;

  return (
    <Card>
      <CardHeader
        title="Scheme comparison"
        description="Published catalogue fields only. No eligibility scoring is applied."
        icon={GitCompare}
        action={<Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>}
      />
      <CardBody>
        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : error ? (
          <ErrorState compact title="Comparison unavailable" message={error} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="pb-2 font-semibold">Field</th>
                  {(data?.items || []).map((scheme) => (
                    <th key={scheme.id} className="pb-2 font-semibold">{scheme.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Provider", (scheme) => scheme.provider],
                  ["Type", (scheme) => titleCaseToken(scheme.scheme_type)],
                  ["Category", (scheme) => scheme.category],
                  ["Rate", rateLabel],
                  ["Tenure", tenureLabel],
                  ["Maximum amount", (scheme) => (scheme.max_amount ? formatCurrency(scheme.max_amount) : "Not specified")],
                  ["Rate verified", (scheme) => (scheme.rate_verified ? "Yes" : "No")],
                  ["Benefits", (scheme) => scheme.benefits],
                ].map(([label, getter]) => (
                  <tr key={label} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2.5 font-medium text-slate-500">{label}</td>
                    {(data?.items || []).map((scheme) => (
                      <td key={scheme.id} className="py-2.5 pr-4 text-slate-700">{getter(scheme)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{data?.note}</p>
      </CardBody>
    </Card>
  );
}

export default function FinancePage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [schemeType, setSchemeType] = useState("All");
  const [category, setCategory] = useState("All");
  const [verification, setVerification] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [schemeType, category, verification]);

  const { data, loading, error, reload } = useApiData(
    () =>
      getFinanceSchemes({
        search,
        scheme_type: schemeType,
        category,
        verification_status: verification,
        page,
        page_size: 9,
      }),
    [search, schemeType, category, verification, page]
  );

  function toggleCompare(id) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return [...current.slice(1), id];
      return [...current, id];
    });
  }

  const exportRows = useMemo(
    () =>
      (data?.items || []).map((scheme) => ({
        name: scheme.name,
        provider: scheme.provider,
        scheme_type: scheme.scheme_type,
        category: scheme.category,
        interest_rate_min: scheme.interest_rate_min,
        interest_rate_max: scheme.interest_rate_max,
        tenure_months_min: scheme.tenure_months_min,
        tenure_months_max: scheme.tenure_months_max,
        max_amount: scheme.max_amount,
        rate_verified: scheme.rate_verified,
        verification_status: scheme.verification_status,
        last_verified_at: scheme.last_verified_at,
        limitations: scheme.limitations,
        is_sample: scheme.is_sample,
      })),
    [data]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D5 · Opportunities"
        icon={Landmark}
        title="Green finance aggregator"
        description="Loans, subsidies, bonds, leases and market mechanisms. Compare catalogue terms side by side."
        actions={
          <>
            <ExportButton rows={exportRows} filename="green-finance.csv" />
            <Button variant="outline" size="sm" onClick={reload} loading={loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
          </>
        }
      />

      {data?.is_sample && (
        <SampleNotice title="Sample finance catalogue">
          No externally verified products are listed yet. Rates, tenure and
          eligibility are illustrative and must be confirmed with the provider
          before applying.
        </SampleNotice>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Finance products"
          value={formatNumber(data?.total, 0)}
          detail="Across the current filters"
          icon={Landmark}
          loading={loading}
        />
        <StatCard
          label="Selected to compare"
          value={`${selectedIds.length} / 4`}
          detail="Select 2–4 schemes"
          icon={GitCompare}
          tone="sky"
        />
        <StatCard
          label="Externally verified"
          value={formatNumber(data?.verification_summary?.verified_external, 0)}
          detail={`${formatNumber(data?.verification_summary?.sample, 0)} sample · ${formatNumber(data?.verification_summary?.unverified, 0)} unverified`}
          icon={ShieldAlert}
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
                placeholder="Search scheme, provider, category…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search finance schemes"
              />
            </div>
            <select className="field h-9 w-auto text-xs" value={schemeType} onChange={(event) => setSchemeType(event.target.value)} aria-label="Filter scheme type">
              <option value="All">All types</option>
              {(data?.facets?.scheme_types || []).map((item) => (
                <option key={item} value={item}>{titleCaseToken(item)}</option>
              ))}
            </select>
            <select className="field h-9 w-auto text-xs" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter category">
              <option value="All">All categories</option>
              {(data?.facets?.categories || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="field h-9 w-auto text-xs" value={verification} onChange={(event) => setVerification(event.target.value)} aria-label="Filter verification status">
              <option value="All">All verification</option>
              {(data?.facets?.verification_statuses || ["VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"]).map((item) => (
                <option key={item} value={item}>{titleCaseToken(item)}</option>
              ))}
            </select>
            {selectedIds.length >= 2 && (
              <Button size="sm" onClick={() => document.getElementById("finance-compare")?.scrollIntoView({ behavior: "smooth" })}>
                <GitCompare size={13} />
                Compare {selectedIds.length}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {error ? (
        <ErrorState title="Finance catalogue unavailable" message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : (data?.items || []).length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((scheme) => {
              const selected = selectedIds.includes(scheme.id);
              return (
                <Card key={scheme.id} className={`flex h-full flex-col ${selected ? "ring-2 ring-forest-400" : ""}`}>
                  <CardBody className="flex flex-1 flex-col pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-forest-700">{scheme.provider}</p>
                        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{scheme.name}</h3>
                      </div>
                      <Badge variant={scheme.rate_verified ? "success" : "warning"}>
                        {scheme.rate_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="forest">{titleCaseToken(scheme.scheme_type)}</Badge>
                      <Badge variant="neutral">{scheme.category}</Badge>
                      <StatusBadge value={scheme.verification_status} />
                    </div>
                    <p className="mt-3 line-clamp-3 flex-1 text-xs leading-5 text-slate-500">{scheme.description}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[11px]">
                      <div>
                        <p className="text-slate-500">Rate</p>
                        <p className="font-semibold text-slate-800">{rateLabel(scheme)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Max amount</p>
                        <p className="font-semibold text-slate-800">{scheme.max_amount ? formatCurrency(scheme.max_amount) : "—"}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">
                      Last verified: {scheme.last_verified_at ? formatDate(scheme.last_verified_at) : "not recorded"}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setDetailId(scheme.id)}>
                        Details
                      </Button>
                      <Button
                        variant={selected ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => toggleCompare(scheme.id)}
                      >
                        <GitCompare size={13} />
                        {selected ? "Selected" : "Compare"}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} label="schemes" />
          <p className="text-[11px] leading-5 text-slate-500">{data.disclaimer}</p>
        </>
      ) : (
        <Card>
          <CardBody className="py-10 text-center">
            <Landmark size={28} className="mx-auto text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-700">No schemes match these filters</h3>
            <p className="mt-1 text-xs text-slate-500">Try a broader search or clear the filters.</p>
          </CardBody>
        </Card>
      )}

      <div id="finance-compare">
        <ComparePanel ids={selectedIds} onClear={() => setSelectedIds([])} />
      </div>

      <Card>
        <CardHeader title="Catalogue note" description="Rates, tenure and eligibility are indicative." icon={IndianRupee} />
        <CardBody>
          <p className="text-[11px] leading-5 text-slate-500">
            Products marked sample are illustrative catalogue entries based on public
            scheme information. Unverified rates must be confirmed with the provider.
            No loan approval, eligibility or credit decision is made by this platform.
          </p>
          <p className="mt-2 text-[10px] text-slate-400">
            Last catalogue update: {data?.items?.[0]?.updated_at ? formatDate(data.items[0].updated_at) : "—"}
          </p>
        </CardBody>
      </Card>

      <SchemeDetail schemeId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
