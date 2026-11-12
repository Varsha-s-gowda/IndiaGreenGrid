import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageLoader } from "./ui/Spinner";
import { useAuth } from "../context/AuthContext";
import { hasRole } from "../lib/access";
import { canAccessPath } from "../lib/workspaces";

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader message="Restoring your session…" />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, loading, dashboardPath } = useAuth();

  if (loading) {
    return <FullPageLoader message="Checking your session…" />;
  }

  if (isAuthenticated) {
    return <Navigate to={dashboardPath} replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { isAdmin, loading, dashboardPath } = useAuth();

  if (loading) {
    return <FullPageLoader message="Verifying access…" />;
  }

  if (!isAdmin) {
    return <Navigate to={dashboardPath} replace />;
  }

  return <Outlet />;
}

export function ResidentRoute() {
  return <Outlet />;
}

export function WorkspaceRoute() {
  const { user, loading, dashboardPath } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageLoader message="Verifying your workspace…" />;
  }

  if (!canAccessPath(user, location.pathname)) {
    return <Navigate to={dashboardPath} replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ allow = [] }) {
  const { user, loading, dashboardPath } = useAuth();

  if (loading) {
    return <FullPageLoader message="Verifying access…" />;
  }

  if (!hasRole(user, allow)) {
    return <Navigate to={dashboardPath} replace />;
  }

  return <Outlet />;
}
