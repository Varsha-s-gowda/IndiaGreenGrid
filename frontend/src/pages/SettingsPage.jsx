import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Database,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Timer,
  UserRound,
  Wifi,
} from "lucide-react";
import { StatusBadge } from "../components/platform/DataBadges";
import Badge, { RoleBadge } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import Toggle from "../components/ui/Toggle";
import { useAuth } from "../context/AuthContext";
import { useHealth } from "../context/HealthContext";
import { useNotifications } from "../context/NotificationContext";
import { getApiErrorMessage, getValidationDetails } from "../lib/apiError";
import { STAKEHOLDER_ROLE_OPTIONS } from "../lib/access";
import { getTokenExpiry } from "../lib/authStorage";
import { INDIAN_STATES } from "../lib/constants";
import { formatDateTime, formatLatency, formatRole, formatTime } from "../lib/formatters";
import { changePassword, updateProfile } from "../services/platformService";

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-800">{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const {
    health,
    database,
    status,
    error,
    refresh,
    refreshing,
    lastChecked,
    samples,
  } = useHealth();
  const { enabled, setEnabled, notifications, unreadCount, markAllRead, clearAll, notify } =
    useNotifications();
  const navigate = useNavigate();
  const [expiry] = useState(() => getTokenExpiry());

  const [profile, setProfile] = useState({
    name: user?.name || "",
    organization: user?.organization || "",
    state: user?.state || "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileDetails, setProfileDetails] = useState([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordDetails, setPasswordDetails] = useState([]);
  const [savingPassword, setSavingPassword] = useState(false);

  function updateProfileField(field) {
    return (event) => {
      setProfile((current) => ({ ...current, [field]: event.target.value }));
      if (profileError) setProfileError("");
    };
  }

  function updatePasswordField(field) {
    return (event) => {
      setPasswords((current) => ({ ...current, [field]: event.target.value }));
      if (passwordError) setPasswordError("");
    };
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError("");
    setProfileDetails([]);
    try {
      const updated = await updateProfile({
        name: profile.name.trim(),
        organization: profile.organization.trim() || null,
        state: profile.state || null,
      });
      updateUser(updated);
      notify({
        type: "success",
        title: "Profile updated",
        message: "Your account details were saved.",
        source: "Settings",
      });
    } catch (requestError) {
      setProfileError(getApiErrorMessage(requestError, "Unable to update your profile."));
      setProfileDetails(getValidationDetails(requestError));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordDetails([]);
    if (passwords.new_password !== passwords.confirm_password) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      setPasswords({ current_password: "", new_password: "", confirm_password: "" });
      notify({
        type: "success",
        title: "Password changed",
        message: "Use your new password the next time you sign in.",
        source: "Security",
      });
    } catch (requestError) {
      setPasswordError(getApiErrorMessage(requestError, "Unable to change your password."));
      setPasswordDetails(getValidationDetails(requestError));
    } finally {
      setSavingPassword(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function handleToggle(value) {
    setEnabled(value);
    if (value) {
      notify({
        type: "info",
        title: "Notifications enabled",
        message: "Session and system events will appear in the notification bell.",
        source: "Settings",
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        icon={ServerCog}
        title="Settings"
        description="Manage your profile and password, review notification preferences, session details and live platform status."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Profile"
              description="Update your name, organisation and state. Email changes are handled by an administrator."
              icon={UserRound}
              action={<RoleBadge role={user?.role} />}
            />
            <CardBody>
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-xs font-semibold text-white">
                  {user?.name
                    ?.split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
                </div>
              </div>

              {user?.verification_status === "PENDING" && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <p className="text-xs font-semibold text-amber-900">
                    Organisation verification pending
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-amber-800">
                    An administrator must verify this organisational account before
                    entity-scoped writes (such as RPO targets) are accepted. National
                    modules remain readable in the meantime.
                  </p>
                </div>
              )}

              {user?.verification_status === "REJECTED" && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
                  <p className="text-xs font-semibold text-rose-900">Verification rejected</p>
                  <p className="mt-1 text-[11px] leading-5 text-rose-800">
                    {user?.verification_note || "An administrator rejected this account."}
                  </p>
                </div>
              )}

              <form onSubmit={handleProfileSave} className="space-y-3" noValidate>
                {profileError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                    <p className="text-xs font-medium text-rose-800">{profileError}</p>
                    {profileDetails.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-[11px] text-rose-700">
                        {profileDetails.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <label className="block">
                  <span className="field-label">Full name</span>
                  <input
                    className="field"
                    value={profile.name}
                    onChange={updateProfileField("name")}
                    minLength={2}
                    maxLength={120}
                    required
                    disabled={savingProfile}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Organisation</span>
                  <input
                    className="field"
                    value={profile.organization}
                    onChange={updateProfileField("organization")}
                    maxLength={160}
                    placeholder="Society, company, utility or institution"
                    disabled={savingProfile}
                  />
                </label>
                <label className="block">
                  <span className="field-label">State</span>
                  <select
                    className="field"
                    value={profile.state}
                    onChange={updateProfileField("state")}
                    disabled={savingProfile}
                  >
                    <option value="">Not specified</option>
                    {INDIAN_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <Button type="submit" size="sm" loading={savingProfile}>
                  <Save size={13} />
                  Save profile
                </Button>
              </form>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <InfoRow label="Account ID">{user?.id ?? "—"}</InfoRow>
                <InfoRow label="Email">{user?.email || "—"}</InfoRow>
                <InfoRow label="Role">{formatRole(user?.role)}</InfoRow>
                <InfoRow label="Verification">
                  <StatusBadge value={user?.verification_status || "VERIFIED"} />
                </InfoRow>
                {user?.verified_at && (
                  <InfoRow label="Verified on">{formatDateTime(user.verified_at)}</InfoRow>
                )}
                {user?.verification_status === "VERIFIED" && user?.verification_note && (
                  <InfoRow label="Verification note">{user.verification_note}</InfoRow>
                )}
                <InfoRow label="Stakeholder portals">
                  {STAKEHOLDER_ROLE_OPTIONS.length}
                </InfoRow>
                <InfoRow label="Created">
                  {user?.created_at ? formatDateTime(user.created_at) : "—"}
                </InfoRow>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Password"
              description="Change the password used to sign in to this account."
              icon={KeyRound}
            />
            <CardBody>
              <form onSubmit={handlePasswordSave} className="space-y-3" noValidate>
                {passwordError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                    <p className="text-xs font-medium text-rose-800">{passwordError}</p>
                    {passwordDetails.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-[11px] text-rose-700">
                        {passwordDetails.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <label className="block">
                  <span className="field-label">Current password</span>
                  <input
                    className="field"
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current_password}
                    onChange={updatePasswordField("current_password")}
                    required
                    disabled={savingPassword}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">New password</span>
                    <input
                      className="field"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.new_password}
                      onChange={updatePasswordField("new_password")}
                      minLength={8}
                      required
                      disabled={savingPassword}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Confirm new password</span>
                    <input
                      className="field"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.confirm_password}
                      onChange={updatePasswordField("confirm_password")}
                      minLength={8}
                      required
                      disabled={savingPassword}
                    />
                  </label>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                  Passwords must be 8–72 characters and no more than 72 UTF-8 bytes.
                  You stay signed in after the change.
                </p>
                <Button type="submit" size="sm" variant="outline" loading={savingPassword}>
                  <KeyRound size={13} />
                  Change password
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Notifications"
              description="Event notifications are generated only from real session and system activity."
              icon={Bell}
              action={<Badge variant="neutral">{unreadCount} unread</Badge>}
            />
            <CardBody className="space-y-4">
              <Toggle
                checked={enabled}
                onChange={handleToggle}
                label="Enable in-app notifications"
                description="Show toast messages and the notification bell for sign-in, health changes and settings updates."
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" onClick={markAllRead} disabled={!notifications.length}>
                  Mark all as read
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={!notifications.length}>
                  Clear notification history
                </Button>
                <span className="text-[11px] text-slate-500">
                  {notifications.length} saved in this session
                </span>
              </div>

              <p className="text-[11px] leading-5 text-slate-500">
                Preference is stored in this browser. Notification history is kept
                in memory for the current session only.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Session" description="Token details for the current browser session." icon={ShieldCheck} />
            <CardBody>
              <InfoRow label="Token type">Bearer JWT</InfoRow>
              <InfoRow label="Storage">Browser session storage</InfoRow>
              <InfoRow label="Expires">
                {expiry ? formatDateTime(expiry.toISOString()) : "—"}
              </InfoRow>
              <InfoRow label="Signed in as">{user?.email || "—"}</InfoRow>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="danger" size="sm" onClick={handleLogout}>
                  <LogOut size={13} />
                  Sign out
                </Button>
                <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing}>
                  <RefreshCw size={13} />
                  Re-check connection
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Platform status"
              description="Live values from the health services."
              icon={Wifi}
              action={
                <Badge
                  variant={status === "online" ? "success" : status === "offline" ? "danger" : "warning"}
                  dot
                >
                  {status === "online" ? "Online" : status === "offline" ? "Offline" : "Degraded"}
                </Badge>
              }
            />
            <CardBody>
              <InfoRow label="API">
                {health ? `${health.app} v${health.version}` : "—"}
              </InfoRow>
              <InfoRow label="Environment">{health?.environment || "—"}</InfoRow>
              <InfoRow label="Database">
                {database ? `${database.dialect} · ${database.database}` : "—"}
              </InfoRow>
              <InfoRow label="DB latency">{formatLatency(database?.latency_ms)}</InfoRow>
              <InfoRow label="Last checked">
                {lastChecked ? formatTime(lastChecked) : "—"}
              </InfoRow>
              <InfoRow label="Samples">{samples.length}</InfoRow>

              {error && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
                  {error}
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={refresh}
                loading={refreshing}
              >
                <RefreshCw size={13} />
                Refresh health
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Connected services" icon={Database} />
            <CardBody className="space-y-2">
              {[
                { method: "GET", path: "/api/health" },
                { method: "GET", path: "/api/health/database" },
                { method: "POST", path: "/api/auth/login" },
                { method: "POST", path: "/api/auth/register" },
                { method: "GET", path: "/api/auth/me" },
                { method: "PUT", path: "/api/auth/profile" },
                { method: "POST", path: "/api/auth/change-password" },
                { method: "GET", path: "/api/dashboard/overview" },
              ].map((endpoint) => (
                <div
                  key={endpoint.path}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2"
                >
                  <span className="rounded bg-forest-50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-forest-700">
                    {endpoint.method}
                  </span>
                  <code className="truncate text-[11px] text-slate-600">{endpoint.path}</code>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="About" icon={Timer} />
            <CardBody>
              <InfoRow label="Application">India Green Grid</InfoRow>
              <InfoRow label="Frontend">React 18 · Vite · Tailwind</InfoRow>
              <InfoRow label="Backend">FastAPI · PostgreSQL</InfoRow>
              <InfoRow label="API version">{health?.version || "—"}</InfoRow>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
