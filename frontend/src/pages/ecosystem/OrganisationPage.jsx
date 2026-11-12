import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
} from "lucide-react";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import { DocumentPanel, Field, NoteBanner } from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import { formatDate, formatDateTime, formatRole } from "../../lib/formatters";
import {
  getMyOrganisation,
  submitMyOrganisation,
  updateMyOrganisation,
} from "../../services/ecosystemService";

const WASTE_CATEGORIES = [
  "LITHIUM_ION",
  "EV_BATTERY",
  "SOLAR_PANEL",
  "EWASTE",
  "LEAD_ACID",
  "OTHER",
];

const ENERGY_TYPES = ["SOLAR", "WIND", "HYDRO", "OTHER", "ANY"];

const SERVICE_SUGGESTIONS = [
  "Rooftop installation",
  "Commercial solar",
  "Battery storage",
  "O&M",
  "Renewable supply",
  "Battery recycling",
  "Panel recycling",
  "E-waste collection",
];

function toForm(profile) {
  return {
    name: profile.name || "",
    registration_number: profile.registration_number || "",
    gstin: profile.gstin || "",
    address: profile.address || "",
    city: profile.city || "",
    state: profile.state || "",
    pincode: profile.pincode || "",
    contact_email: profile.contact_email || "",
    contact_phone: profile.contact_phone || "",
    website: profile.website || "",
    description: profile.description || "",
    services: (profile.services || []).join(", "),
    serviceable_states: profile.serviceable_states || [],
    capacity_kwp: profile.capacity_kwp ?? "",
    accepted_categories: profile.accepted_categories || [],
    energy_types: profile.energy_types || [],
  };
}

function toggle(list, value) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export default function OrganisationPage() {
  const { user } = useAuth();
  const profile = useApiData(getMyOrganisation, []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile.data && profile.data.id) {
      setForm(toForm(profile.data));
    }
  }, [profile.data]);

  const organisation = profile.data;
  const isVerified = organisation?.verification_status === "VERIFIED";
  const isSuspended =
    organisation?.is_suspended || organisation?.verification_status === "SUSPENDED";
  const canSubmit =
    organisation &&
    !isVerified &&
    !isSuspended &&
    Boolean(form?.name);

  async function save(event) {
    event?.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateMyOrganisation({
        name: form.name,
        registration_number: form.registration_number || null,
        gstin: form.gstin || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        website: form.website || null,
        description: form.description,
        services: form.services
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        serviceable_states: form.serviceable_states,
        capacity_kwp: form.capacity_kwp === "" ? null : Number(form.capacity_kwp),
        accepted_categories: form.accepted_categories,
        energy_types: form.energy_types,
      });
      setMessage("Organisation profile saved.");
      profile.reload();
    } catch (saveError) {
      setError(saveError?.message || "The profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVerification() {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await submitMyOrganisation();
      setMessage(
        "Verification requested. An administrator will review your profile and documents."
      );
      profile.reload();
    } catch (submitError) {
      setError(submitError?.message || "Verification could not be requested.");
    } finally {
      setSubmitting(false);
    }
  }

  if (profile.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Business account"
          icon={Building2}
          title="Organisation profile"
          description="Verification status, business details and supporting documents."
        />
        <ErrorState
          title="Organisation profile unavailable"
          message={profile.error}
          onRetry={profile.reload}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business account"
        icon={Building2}
        title={organisation?.name || "Organisation profile"}
        description={`${formatRole(user?.role)} · verification and service coverage`}
        actions={
          <>
            {organisation?.verification_status && (
              <StatusBadge value={organisation.verification_status} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={profile.reload}
              loading={profile.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {isSuspended && (
        <NoteBanner tone="danger" title="Organisation suspended">
          This organisation is suspended. Upload supporting evidence and contact an
          administrator for reactivation.
        </NoteBanner>
      )}

      {organisation && !isVerified && !isSuspended && (
        <NoteBanner tone="warning" title="Verification required for workflow actions">
          Your account can sign in and view national modules, but entity-scoped actions
          (publishing requirements, quoting, filings, loan products, pickups) require an
          administrator-verified organisation profile.
        </NoteBanner>
      )}

      {isVerified && (
        <NoteBanner tone="info" title="Verified organisation">
          Verified on {organisation.verified_at ? formatDate(organisation.verified_at) : "record"}.
          Business details can be updated without losing verification status.
        </NoteBanner>
      )}

      {error && <NoteBanner tone="danger">{error}</NoteBanner>}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[11px] font-medium text-emerald-800">
          <CheckCircle2 size={14} /> {message}
        </div>
      )}

      {profile.loading && !form ? (
        <div className="h-64 animate-pulse rounded-xl bg-white shadow-card" />
      ) : form ? (
        <>
          <Card>
            <CardHeader
              title="Business details"
              description="These details are visible to counterparties in your workflows."
              icon={Building2}
              action={
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" loading={saving} onClick={save}>
                    <Save size={13} /> Save profile
                  </Button>
                  {canSubmit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={submitting}
                      onClick={submitVerification}
                    >
                      <Send size={13} /> Submit for verification
                    </Button>
                  )}
                </div>
              }
            />
            <CardBody>
              <form className="space-y-3" onSubmit={save}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Legal business name">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      required
                      minLength={2}
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Registration number">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.registration_number}
                      onChange={(event) =>
                        setForm({ ...form, registration_number: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="GSTIN">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.gstin}
                      onChange={(event) =>
                        setForm({ ...form, gstin: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Website">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.website}
                      onChange={(event) =>
                        setForm({ ...form, website: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Contact email">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      type="email"
                      value={form.contact_email}
                      onChange={(event) =>
                        setForm({ ...form, contact_email: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Contact phone">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.contact_phone}
                      onChange={(event) =>
                        setForm({ ...form, contact_phone: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Registered address">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="City">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.city}
                      onChange={(event) =>
                        setForm({ ...form, city: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="State">
                    <select
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.state}
                      onChange={(event) =>
                        setForm({ ...form, state: event.target.value })
                      }
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pincode">
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.pincode}
                      onChange={(event) =>
                        setForm({ ...form, pincode: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Business description">
                  <textarea
                    className="field mt-1 min-h-[90px] w-full text-xs"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Services"
                    hint="Comma-separated services shown to counterparties."
                  >
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      value={form.services}
                      onChange={(event) =>
                        setForm({ ...form, services: event.target.value })
                      }
                      placeholder={SERVICE_SUGGESTIONS.slice(0, 3).join(", ")}
                    />
                  </Field>
                  <Field
                    label="Installed / annual capacity (kWp)"
                    hint="Optional capacity figure used in analytics."
                  >
                    <input
                      className="field mt-1 h-9 w-full text-xs"
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.capacity_kwp}
                      onChange={(event) =>
                        setForm({ ...form, capacity_kwp: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field
                  label="Serviceable states"
                  hint="Used to match solar requests, procurement requirements and pickup availability."
                >
                  <select
                    multiple
                    size={6}
                    className="field mt-1 w-full text-xs"
                    value={form.serviceable_states}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        serviceable_states: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value
                        ),
                      })
                    }
                  >
                    {INDIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </Field>

                {user?.role === "RECYCLER" && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700">
                      Accepted waste categories
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {WASTE_CATEGORIES.map((category) => (
                        <label
                          key={category}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={form.accepted_categories.includes(category)}
                            onChange={() =>
                              setForm({
                                ...form,
                                accepted_categories: toggle(
                                  form.accepted_categories,
                                  category
                                ),
                              })
                            }
                          />
                          {titleCaseToken(category)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {user?.role === "RENEWABLE_SUPPLIER" && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700">
                      Energy types supplied
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {ENERGY_TYPES.map((type) => (
                        <label
                          key={type}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={form.energy_types.includes(type)}
                            onChange={() =>
                              setForm({
                                ...form,
                                energy_types: toggle(form.energy_types, type),
                              })
                            }
                          />
                          {titleCaseToken(type)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  {canSubmit && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={submitting}
                      onClick={submitVerification}
                    >
                      <Send size={13} /> Submit for verification
                    </Button>
                  )}
                  <Button type="submit" size="sm" loading={saving}>
                    <Save size={13} /> Save profile
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <DocumentPanel
                entityType="ORGANISATION"
                entityId={organisation.id}
                canUpload
                canReview={user?.role === "ADMIN"}
                documentTypes={[
                  "REGISTRATION_CERTIFICATE",
                  "GST_CERTIFICATE",
                  "PAN_CARD",
                  "LICENCE",
                  "SUPPORTING",
                ]}
                title="Verification documents"
                description="Registration, tax and licence evidence reviewed by administrators."
              />
            </div>

            <Card>
              <CardHeader
                title="Verification history"
                description="Every submission and decision is recorded."
                icon={FileCheck2}
                action={
                  <Badge variant="neutral">
                    {(organisation.history || []).length} entries
                  </Badge>
                }
              />
              <CardBody>
                {(organisation.history || []).length ? (
                  <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                    {organisation.history.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span className="absolute -left-[1.65rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-forest-700" />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge value={entry.status_after} />
                          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
                            {titleCaseToken(entry.action)}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="mt-1 text-[11px] leading-5 text-slate-600">
                            {entry.note}
                          </p>
                        )}
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock size={10} />
                          {entry.created_at ? formatDateTime(entry.created_at) : "—"}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-500">
                    No verification events recorded yet.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {organisation.verification_note && (
            <NoteBanner
              tone={isSuspended ? "danger" : "info"}
              title="Administrator note"
            >
              {organisation.verification_note}
            </NoteBanner>
          )}

          {organisation.is_suspended && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[11px] text-rose-800">
              <ShieldAlert size={14} /> This business is suspended and cannot perform
              workflow actions until an administrator reactivates it.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
