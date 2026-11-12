import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getHealth } from "../../services/healthService";

export default function BackendStatus() {
  const [state, setState] = useState({ loading: true, health: null, error: "" });

  const check = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const health = await getHealth();
      setState({ loading: false, health, error: "" });
    } catch {
      setState({
        loading: false,
        health: null,
        error: "Backend API is not reachable. Start FastAPI on port 8000.",
      });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state.loading) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Checking backend connection…
      </span>
    );
  }

  if (state.health) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
        <Wifi size={12} />
        API online · {state.health.app} v{state.health.version} · {state.health.environment}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700">
      <WifiOff size={12} />
      {state.error}
      <button
        type="button"
        onClick={check}
        className="ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold text-rose-700 underline-offset-2 hover:underline"
      >
        <RefreshCw size={10} />
        Retry
      </button>
    </span>
  );
}
