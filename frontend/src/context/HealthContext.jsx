import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getApiErrorMessage } from "../lib/apiError";
import { HEALTH_POLL_INTERVAL_MS, MAX_HEALTH_SAMPLES } from "../lib/config";
import { formatTime } from "../lib/formatters";
import { getDatabaseHealth, getHealth } from "../services/healthService";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";

const HealthContext = createContext(null);

const INITIAL_STATE = {
  health: null,
  database: null,
  status: "checking",
  loading: true,
  refreshing: false,
  error: "",
  lastChecked: null,
  samples: [],
};

export function HealthProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const { isAuthenticated } = useAuth();
  const { notify } = useNotifications();
  const notifyRef = useRef(notify);
  const previousStatus = useRef(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const performCheck = useCallback(async ({ manual = false } = {}) => {
    const sequence = ++requestSequence.current;
    const previous = previousStatus.current;

    setState((current) => ({
      ...current,
      refreshing: manual,
    }));

    const startedAt = performance.now();
    let health = null;
    let database = null;
    let healthError = "";
    let databaseError = "";

    try {
      health = await getHealth();
    } catch (error) {
      healthError = getApiErrorMessage(
        error,
        "The API health check failed."
      );
    }

    const apiLatency = Math.round((performance.now() - startedAt) * 10) / 10;

    if (health) {
      try {
        database = await getDatabaseHealth();
      } catch (error) {
        databaseError = getApiErrorMessage(
          error,
          "The database health check failed."
        );
      }
    }

    if (sequence !== requestSequence.current) return;

    const status = health ? (database ? "online" : "degraded") : "offline";
    const error = healthError || databaseError;
    const checkedAt = new Date().toISOString();

    setState((current) => {
      const samples = health
        ? [
            ...current.samples,
            {
              id: checkedAt,
              label: formatTime(checkedAt),
              apiLatency,
              dbLatency:
                database?.latency_ms === undefined ? null : database.latency_ms,
            },
          ].slice(-MAX_HEALTH_SAMPLES)
        : current.samples;

      return {
        health,
        database,
        status,
        loading: false,
        refreshing: false,
        error,
        lastChecked: checkedAt,
        samples,
      };
    });

    if (previous && previous !== status) {
      if (status === "online") {
        notifyRef.current({
          type: "success",
          title: "Backend connection restored",
          message: "The API and PostgreSQL database are responding again.",
          source: "System health",
        });
      } else if (status === "degraded") {
        notifyRef.current({
          type: "warning",
          title: "Database connection degraded",
          message:
            "The API is responding, but the database health check failed.",
          source: "System health",
        });
      } else {
        notifyRef.current({
          type: "error",
          title: "Backend unavailable",
          message:
            "The API could not be reached. Some workspace features may be unavailable.",
          source: "System health",
        });
      }
    }

    previousStatus.current = status;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      previousStatus.current = null;
      requestSequence.current += 1;
      setState(INITIAL_STATE);
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    async function runCheck() {
      await performCheck();
      if (!cancelled) {
        timer = window.setTimeout(runCheck, HEALTH_POLL_INTERVAL_MS);
      }
    }

    runCheck();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isAuthenticated, performCheck]);

  const refresh = useCallback(() => performCheck({ manual: true }), [performCheck]);

  const value = useMemo(
    () => ({
      ...state,
      apiOnline: state.status === "online" || state.status === "degraded",
      refresh,
    }),
    [state, refresh]
  );

  return (
    <HealthContext.Provider value={value}>{children}</HealthContext.Provider>
  );
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) {
    throw new Error("useHealth must be used inside HealthProvider.");
  }
  return context;
}
