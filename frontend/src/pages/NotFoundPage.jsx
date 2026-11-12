import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function NotFoundPage() {
  const { isAuthenticated, dashboardPath } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-800 text-white shadow-sm">
          <Sun size={26} strokeWidth={2.2} />
        </span>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-forest-700">
          India Green Grid
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The page you requested does not exist or has not been implemented yet.
          No placeholder page is shown in its place.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Link
            to={isAuthenticated ? dashboardPath : "/login"}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-forest-800 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-forest-900"
          >
            <ArrowLeft size={15} />
            {isAuthenticated ? "Back to dashboard" : "Go to sign in"}
          </Link>
          {isAuthenticated && (
            <Link
              to="/simulation"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300"
            >
              <Compass size={15} />
              Explore modules
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
