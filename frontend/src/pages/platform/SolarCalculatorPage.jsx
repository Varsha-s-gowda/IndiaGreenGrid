import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calculator,
  IndianRupee,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import ExportButton from "../../components/platform/ExportButton";
import { StatusBadge, labelForToken } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage, getValidationDetails } from "../../lib/apiError";
import { CUSTOMER_TYPES, titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  calculateSolar,
  getSolarCalculations,
  getSolarOptions,
} from "../../services/platformService";

const SYSTEM_PREFERENCES = [
  {
    value: "AUTO",
    label: "Auto (smaller of roof and consumption)",
    help: "The backend sizes the system to whichever limit is smaller.",
  },
  {
    value: "MAX_ROOF",
    label: "Maximise roof usage",
    help: "Uses as much roof area as possible; surplus may be exported.",
  },
  {
    value: "MATCH_CONSUMPTION",
    label: "Match annual consumption",
    help: "Sizes generation to your annual usage; spare roof stays unused.",
  },
  {
    value: "CUSTOM",
    label: "Enter a size",
    help: "Your chosen kWp is capped by the available roof area.",
  },
];

function emptyForm(user) {
  return {
    location: "",
    state: user?.state || "Delhi",
    customer_type: "RESIDENTIAL",
    monthly_consumption_kwh: "",
    rooftop_area_sqm: "",
    tariff_per_kwh: "",
    system_preference: "AUTO",
    preferred_kwp: "",
  };
}

export default function SolarCalculatorPage() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const options = useApiData(getSolarOptions, []);
  const history = useApiData(() => getSolarCalculations({ limit: 20 }), []);
  const [form, setForm] = useState(emptyForm(user));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(emptyForm(user));
  }, [user]);

  const stateOptions = options.data?.items || [];
  const selectedState = useMemo(
    () => stateOptions.find((item) => item.state === form.state),
    [stateOptions, form.state]
  );

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setDetails([]);
    try {
      const payload = {
        location: form.location.trim() || form.state,
        state: form.state,
        customer_type: form.customer_type,
        monthly_consumption_kwh: Number(form.monthly_consumption_kwh),
        rooftop_area_sqm: Number(form.rooftop_area_sqm),
        system_preference: form.system_preference,
      };
      if (form.tariff_per_kwh) payload.tariff_per_kwh = Number(form.tariff_per_kwh);
      if (form.system_preference === "CUSTOM" && form.preferred_kwp) {
        payload.preferred_kwp = Number(form.preferred_kwp);
      }
      const calculation = await calculateSolar(payload);
      setResult(calculation);
      history.reload();
      notify({
        type: "success",
        title: "Rooftop estimate ready",
        message: `${formatNumber(calculation.recommended_kwp, 1)} kWp recommended for ${calculation.location}.`,
        source: "Rooftop calculator",
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to calculate a rooftop estimate."));
      setDetails(getValidationDetails(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const costRows = result
    ? [
        { name: "Installation", value: result.installation_cost, color: "#475569" },
        { name: "Subsidy", value: result.subsidy_amount, color: "#10b981" },
        { name: "Net cost", value: result.net_cost, color: "#2d744c" },
      ]
    : [];

  const exportRows = useMemo(
    () =>
      (history.data?.items || []).map((item) => ({
        id: item.id,
        location: item.location,
        state: item.state,
        customer_type: item.customer_type,
        recommended_kwp: item.recommended_kwp,
        installation_cost: item.installation_cost,
        subsidy_amount: item.subsidy_amount,
        net_cost: item.net_cost,
        annual_savings: item.annual_savings,
        payback_years: item.payback_years,
        lifetime_savings: item.lifetime_savings,
        co2_reduction_kg: item.co2_reduction_kg,
        created_at: item.created_at,
      })),
    [history.data]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D3 · Opportunities"
        icon={Calculator}
        title="Rooftop solar ROI & subsidy calculator"
        description="Estimate system size, cost, subsidy, savings and payback. All figures are calculated by the Python backend from explicit assumptions."
        actions={<Badge variant="info">Planning estimate</Badge>}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Your rooftop inputs"
            description="Assumptions default to indicative state planning values."
            icon={Sun}
          />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-rose-800">{error}</p>
                  {details.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-[11px] text-rose-700">
                      {details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">State</span>
                  <select className="field" value={form.state} onChange={update("state")} required>
                    {!stateOptions.length && <option value={form.state}>{form.state || "Loading…"}</option>}
                    {stateOptions.map((item) => (
                      <option key={item.state} value={item.state}>{item.state}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Customer type</span>
                  <select className="field" value={form.customer_type} onChange={update("customer_type")}>
                    {(options.data?.customer_types || CUSTOMER_TYPES.map((value) => ({ value, label: titleCaseToken(value) }))).map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="field-label">City / location</span>
                <input className="field" value={form.location} onChange={update("location")} placeholder={form.state} maxLength={120} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Monthly consumption (kWh)</span>
                  <input className="field" type="number" min="0.01" step="0.01" value={form.monthly_consumption_kwh} onChange={update("monthly_consumption_kwh")} required />
                </label>
                <label className="block">
                  <span className="field-label">Rooftop area (m²)</span>
                  <input className="field" type="number" min="0.01" step="0.01" value={form.rooftop_area_sqm} onChange={update("rooftop_area_sqm")} required />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Sizing preference</span>
                  <select className="field" value={form.system_preference} onChange={update("system_preference")}>
                    {SYSTEM_PREFERENCES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {form.system_preference === "CUSTOM" ? (
                  <label className="block">
                    <span className="field-label">Preferred system size (kWp)</span>
                    <input
                      className="field"
                      type="number"
                      min="0.1"
                      max="1000"
                      step="0.1"
                      value={form.preferred_kwp}
                      onChange={update("preferred_kwp")}
                      placeholder="e.g. 5"
                    />
                  </label>
                ) : (
                  <div className="self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
                    {(SYSTEM_PREFERENCES.find((option) => option.value === form.system_preference) || {}).help}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="field-label">Tariff (₹/kWh, optional)</span>
                <input
                  className="field"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.tariff_per_kwh}
                  onChange={update("tariff_per_kwh")}
                  placeholder={selectedState ? `Default ${selectedState.default_tariff_per_kwh}` : "Use state default"}
                />
              </label>

              {selectedState && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
                  Indicative state assumptions: <strong>{selectedState.peak_sun_hours} peak sun hours/day</strong>{" "}
                  · default tariff ₹{selectedState.default_tariff_per_kwh}/kWh
                  {selectedState.residential_subsidy_available ? " · residential subsidy assumed available" : ""}
                </div>
              )}

              <Button type="submit" fullWidth loading={submitting}>
                <Calculator size={15} />
                Calculate rooftop estimate
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                {options.data?.note ||
                  "Indicative planning assumptions. Verify irradiance, tariff and subsidy eligibility independently."}
              </p>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          {!result ? (
            <Card>
              <CardBody className="flex min-h-[24rem] flex-col items-center justify-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-forest-100 bg-forest-50 text-forest-700">
                  <Sun size={26} />
                </span>
                <h2 className="mt-4 text-sm font-semibold text-slate-800">
                  Your estimate will appear here
                </h2>
                <p className="mt-1.5 max-w-sm text-xs leading-6 text-slate-500">
                  Enter consumption and roof area. The backend recommends a capacity,
                  applies the subsidy rules for your customer type and state, and
                  returns payback and lifetime savings.
                </p>
              </CardBody>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Recommended system"
                  value={`${formatNumber(result.recommended_kwp, 1)} kWp`}
                  detail={`${formatNumber(result.annual_generation_kwh, 0)} kWh/year`}
                  icon={Sun}
                  tone="forest"
                />
                <StatCard
                  label="Estimated payback"
                  value={result.payback_years === null ? "—" : `${formatNumber(result.payback_years, 2)} years`}
                  detail={`Net cost ${formatCurrency(result.net_cost)}`}
                  icon={IndianRupee}
                  tone="emerald"
                />
                <StatCard
                  label="Central subsidy"
                  value={formatCurrency(result.subsidy_amount)}
                  detail={labelForToken(result.subsidy_status || (result.subsidy_eligible ? "APPLIED" : "NOT_ELIGIBLE"))}
                  icon={ShieldCheck}
                  tone={result.subsidy_eligible ? "sky" : "slate"}
                />
                <StatCard
                  label="Annual savings"
                  value={formatCurrency(result.annual_savings)}
                  detail={`Lifetime net benefit ${formatCurrency(result.lifetime_savings)}`}
                  icon={Leaf}
                  tone="amber"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Cost breakdown" description="Estimates returned by the calculation service." icon={IndianRupee} />
                  <CardBody>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={costRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={62} tickFormatter={(value) => `₹${formatNumber(value / 1000, 0)}k`} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="value" name="Amount (₹)" radius={[4, 4, 0, 0]}>
                            {costRows.map((row) => (
                              <Cell key={row.name} fill={row.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Assumptions & caveats" description="Each saved calculation stores the assumptions used." icon={ShieldCheck} />
                  <CardBody>
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                        <p className="text-[10px] text-slate-500">Sizing preference</p>
                        <p className="mt-0.5 font-semibold text-slate-800">
                          {labelForToken(result.system_preference || "AUTO")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                        <p className="text-[10px] text-slate-500">Roof limit / consumption limit</p>
                        <p className="mt-0.5 font-semibold text-slate-800">
                          {formatNumber(result.area_capacity_kwp, 1)} / {formatNumber(result.consumption_capacity_kwp, 1)} kWp
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {[
                        ["Peak sun hours", result.assumptions?.peak_sun_hours_per_day],
                        ["Performance ratio", result.assumptions?.performance_ratio],
                        ["Area per kWp", result.assumptions?.area_per_kwp_sqm],
                        ["Cost per kWp", result.assumptions?.cost_per_kwp],
                        ["CO2 factor", result.assumptions?.co2_factor_kg_per_kwh],
                        ["Lifetime", result.assumptions?.system_lifetime_years],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 px-2.5 py-2">
                          <p className="text-[10px] text-slate-500">{label}</p>
                          <p className="mt-0.5 font-semibold text-slate-800">{value ?? "—"}</p>
                        </div>
                      ))}
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {(result.notifications || []).map((note) => (
                        <li key={note} className="flex items-start gap-2 text-[11px] leading-5 text-slate-600">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-forest-500" />
                          {note}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                      {result.assumptions?.disclaimer}
                    </p>
                  </CardBody>
                </Card>
              </div>

              {result.scheme && (
                <Card>
                  <CardHeader
                    title="Subsidy eligibility and scheme reference"
                    description="Eligibility is evaluated by the backend against the installed capacity and customer type."
                    icon={ShieldCheck}
                    action={<StatusBadge value={result.subsidy_status || "NOT_ELIGIBLE"} />}
                  />
                  <CardBody>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Scheme</p>
                        <p className="mt-1 text-xs font-medium text-slate-800">{result.scheme.scheme_name}</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{result.scheme.authority}</p>
                        {result.scheme.source_url && (
                          <a
                            href={result.scheme.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[11px] font-medium text-forest-700 hover:underline"
                          >
                            Official scheme page ↗
                          </a>
                        )}
                        <ul className="mt-2 list-inside list-disc space-y-1 text-[10px] leading-4 text-slate-500">
                          {(result.scheme.subsidy_bands || []).map((band) => (
                            <li key={band}>{band}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Conditions applied</p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] leading-5 text-slate-600">
                          {(result.scheme.eligibility_conditions || []).map((condition) => (
                            <li key={condition}>{condition}</li>
                          ))}
                        </ul>
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                          {result.scheme.note}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}

              <Card>
                <CardHeader title="Environmental benefit" description="Estimated annual CO2 reduction from the recommended system." icon={Leaf} />
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">
                      {formatNumber(result.co2_reduction_kg, 0)}
                      <span className="ml-1 text-xs font-normal text-slate-500">kg CO2/year</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Based on the returned grid emission factor. Planning estimate only.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Capacity limited by</p>
                    <p className="text-sm font-semibold capitalize text-slate-800">
                      {(result.assumptions?.capacity_limited_by || "").replaceAll("_", " ")}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Saved calculations"
          description={user?.role === "ADMIN" ? "All calculations across the platform (admin view)." : "Your recent rooftop assessments."}
          icon={Calculator}
          action={
            <div className="flex items-center gap-2">
              <ExportButton rows={exportRows} filename="rooftop-calculations.csv" />
              <Button variant="ghost" size="sm" onClick={history.reload} loading={history.loading}>
                <RefreshCw size={13} />
              </Button>
            </div>
          }
        />
        <CardBody>
          {history.error ? (
            <ErrorState compact title="History unavailable" message={history.error} onRetry={history.reload} />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Location</th>
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 text-right font-semibold">kWp</th>
                    <th className="pb-2 text-right font-semibold">Subsidy</th>
                    <th className="pb-2 text-right font-semibold">Net cost</th>
                    <th className="pb-2 text-right font-semibold">Annual savings</th>
                    <th className="pb-2 text-right font-semibold">Payback</th>
                    <th className="pb-2 text-right font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(history.data?.items || []).map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setResult(item)}
                      className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-forest-50/40"
                    >
                      <td className="py-2.5 font-medium text-slate-800">{item.location}<span className="ml-1 text-[10px] text-slate-400">{item.state}</span></td>
                      <td className="py-2.5 text-slate-600">{titleCaseToken(item.customer_type)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(item.recommended_kwp, 1)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(item.subsidy_amount)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(item.net_cost)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(item.annual_savings)}</td>
                      <td className="py-2.5 text-right text-slate-600">{item.payback_years === null ? "—" : `${formatNumber(item.payback_years, 2)} y`}</td>
                      <td className="py-2.5 text-right text-slate-500">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                  {!(history.data?.items || []).length && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                        No saved calculations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Click a row to reopen its saved result. Every calculation is persisted with
            the assumptions used at the time.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
