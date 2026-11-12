import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Factory,
  Home,
  Info,
  Landmark,
  LockKeyhole,
  Mail,
  Scale,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import BackendStatus from "../components/auth/BackendStatus";
import LoginBrandPanel from "../components/auth/LoginBrandPanel";
import Button from "../components/ui/Button";
import { Input, PasswordInput } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage, getValidationDetails } from "../lib/apiError";
import { getDashboardPath } from "../lib/authRoutes";
import { canAccessPath } from "../lib/workspaces";

const DEMO_ACCOUNTS = [
  {
    label: "Administrator",
    email: import.meta.env.VITE_DEMO_ADMIN_EMAIL || "admin@solarequity.com",
    icon: ShieldCheck,
  },
  {
    label: "Resident",
    email: import.meta.env.VITE_DEMO_RESIDENT_EMAIL || "resident101@solarequity.com",
    icon: Home,
  },
  {
    label: "Citizen",
    email: "citizen@solarequity.com",
    icon: UserRound,
  },
  {
    label: "DISCOM",
    email: "discom@solarequity.com",
    icon: Building2,
  },
  {
    label: "Industry",
    email: "industry@solarequity.com",
    icon: Factory,
  },
  {
    label: "Finance",
    email: "finance@solarequity.com",
    icon: Landmark,
  },
  {
    label: "Policymaker",
    email: "policy@solarequity.com",
    icon: Scale,
  },
];

function resolveDestination(user, from) {
  const dashboard = getDashboardPath(user);
  if (!from || from === "/login" || from === "/register") return dashboard;
  if (!canAccessPath(user, from)) return dashboard;
  return from;
}

export default function LoginPage() {
  const { login, authNotice, clearAuthNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const passwordRef = useRef(null);

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  function useDemoAccount(account) {
    setForm((current) => ({ ...current, email: account.email }));
    setError("");
    clearAuthNotice();
    passwordRef.current?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setDetails([]);
    clearAuthNotice();

    if (!form.email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (!form.password) {
      setError("Enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(form.email.trim().toLowerCase(), form.password);
      navigate(resolveDestination(user, location.state?.from), { replace: true });
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, "Unable to sign in. Please try again."));
      setDetails(getValidationDetails(loginError));
      setForm((current) => ({ ...current, password: "" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      brandPanel={<LoginBrandPanel />}
      decorated
      centered
      title="Sign in to India Green Grid"
      subtitle="Access your stakeholder workspace across national intelligence, opportunities and community solar."
      footer={
        <>
          New to the platform?{" "}
          <Link
            to="/register"
            className="font-semibold text-forest-700 transition hover:text-forest-800 hover:underline hover:underline-offset-2"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="mb-5 flex justify-center">
        <BackendStatus />
      </div>

      {authNotice && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs leading-5 text-amber-800">{authNotice}</p>
        </div>
      )}

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
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@solarequity.com"
          icon={Mail}
          value={form.email}
          onChange={update("email")}
          disabled={submitting}
          required
        />

        <PasswordInput
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          icon={LockKeyhole}
          value={form.password}
          onChange={update("password")}
          disabled={submitting}
          required
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          className="mt-1 h-12 text-[15px] shadow-lg shadow-forest-900/15"
        >
          {submitting ? "Signing in…" : "Sign in"}
          {!submitting && <ArrowRight size={17} />}
        </Button>
      </form>

      <div className="login-demo mt-6 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest-50 text-forest-700 ring-1 ring-forest-100">
            <Users size={14} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Demo accounts
            </p>
            <p className="text-[10px] leading-4 text-slate-400">
              One-click email autofill · passwords stay in the backend
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] leading-5 text-slate-500">
          Seeded by the backend seed script. Passwords are set through{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
            DEMO_ADMIN_PASSWORD
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
            DEMO_RESIDENT_PASSWORD
          </code>{" "}
          in{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
            backend/.env
          </code>
          .
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => {
            const Icon = account.icon;
            return (
              <button
                key={account.label}
                type="button"
                onClick={() => useDemoAccount(account)}
                className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition duration-200 hover:-translate-y-px hover:border-forest-200 hover:bg-forest-50/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/30"
                title={`Autofill ${account.label} email`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-forest-700 ring-1 ring-slate-100 transition group-hover:bg-white group-hover:ring-forest-100">
                  <Icon size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold text-slate-800">
                    {account.label}
                  </span>
                  <span className="block truncate text-[10.5px] text-slate-500">
                    {account.email}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </AuthLayout>
  );
}
