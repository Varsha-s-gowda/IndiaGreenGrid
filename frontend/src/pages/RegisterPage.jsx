import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import BackendStatus from "../components/auth/BackendStatus";
import Button from "../components/ui/Button";
import { Input, PasswordInput } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage, getValidationDetails } from "../lib/apiError";
import { STAKEHOLDER_ROLE_OPTIONS } from "../lib/access";
import { getDashboardPath } from "../lib/authRoutes";
import { INDIAN_STATES } from "../lib/constants";

const ORGANISATIONAL_ROLES = [
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
  "SOLAR_INSTALLER",
  "RENEWABLE_SUPPLIER",
  "RECYCLER",
];

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "RESIDENT",
    organization: "",
    state: "",
  });
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  function validate() {
    if (form.name.trim().length < 2) return "Enter your full name (at least 2 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Enter a valid email address.";
    }
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (byteLength(form.password) > 72) return "Password must not exceed 72 UTF-8 bytes.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setDetails([]);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        organization: form.organization.trim() || undefined,
        state: form.state || undefined,
      });
      navigate(getDashboardPath(user), { replace: true });
    } catch (registerError) {
      setError(
        getApiErrorMessage(registerError, "Unable to create your account. Please try again.")
      );
      setDetails(getValidationDetails(registerError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your India Green Grid account"
      subtitle="Select a stakeholder portal to register. Administrator accounts are provisioned separately."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-forest-700 hover:text-forest-800">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-5">
        <BackendStatus />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3"
            role="alert"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
            <div>
              <p className="text-xs font-medium leading-5 text-rose-800">{error}</p>
              {details.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-[11px] leading-5 text-rose-700">
                  {details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="e.g. Resident 103"
          icon={UserRound}
          value={form.name}
          onChange={update("name")}
          disabled={submitting}
          required
        />

        <Input
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@organisation.com"
          icon={Mail}
          value={form.email}
          onChange={update("email")}
          disabled={submitting}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Stakeholder role</span>
            <select
              className="field"
              name="role"
              value={form.role}
              onChange={update("role")}
              disabled={submitting}
            >
              {STAKEHOLDER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">State (optional)</span>
            <select
              className="field"
              name="state"
              value={form.state}
              onChange={update("state")}
              disabled={submitting}
            >
              <option value="">Not specified</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>
        </div>

        <Input
          label="Organisation (optional)"
          name="organization"
          autoComplete="organization"
          placeholder="Society, company, utility or institution"
          icon={Building2}
          value={form.organization}
          onChange={update("organization")}
          disabled={submitting}
        />

        {ORGANISATIONAL_ROLES.includes(form.role) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-amber-900">
              Organisational accounts require administrator approval
            </p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              A {form.role.replaceAll("_", " ").toLowerCase()} account is created
              with PENDING verification. You can read national modules
              immediately, but entity-scoped writes (RPO targets, applications
              tied to your organisation) unlock only after an administrator
              verifies the account. ADMIN cannot be self-assigned.
            </p>
          </div>
        )}

        <PasswordInput
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={update("password")}
          hint="Between 8 and 72 characters."
          disabled={submitting}
          required
        />

        <PasswordInput
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={form.confirm}
          onChange={update("confirm")}
          disabled={submitting}
          required
        />

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? "Creating account…" : "Create account"}
          {!submitting && <ArrowRight size={16} />}
        </Button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <LockKeyhole size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <p className="text-[11px] leading-5 text-slate-500">
          You may self-select any stakeholder role except administrator. Resident
          and citizen accounts are active immediately; organisational roles start
          PENDING until an administrator approves them. Authorization is enforced
          by the backend, not just the interface.
        </p>
      </div>
    </AuthLayout>
  );
}
