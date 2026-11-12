import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getApiErrorMessage } from "../lib/apiError";
import { getApartments } from "../services/solarTwinService";
import { getBillingSummary } from "../services/billingService";

const BillingContext = createContext(null);

export function BillingProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  const [apartments, setApartments] = useState([]);
  const [apartmentsLoading, setApartmentsLoading] = useState(true);
  const [apartmentsError, setApartmentsError] = useState("");

  const requestedRunId = Number(searchParams.get("run")) || null;
  const month = searchParams.get("month") || "";

  const runOptions = useMemo(
    () => summary?.available_runs || [],
    [summary]
  );

  const selectedRunId = useMemo(() => {
    if (requestedRunId) return requestedRunId;
    return runOptions[0]?.id ?? null;
  }, [requestedRunId, runOptions]);

  const selectedRun = useMemo(
    () => runOptions.find((run) => run.id === selectedRunId) || null,
    [runOptions, selectedRunId]
  );

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const result = await getBillingSummary({
        allocation_run_id: requestedRunId || undefined,
        billing_month: month || undefined,
      });
      setSummary(result);
    } catch (requestError) {
      setSummary(null);
      setSummaryError(
        getApiErrorMessage(requestError, "Unable to load billing data.")
      );
    } finally {
      setSummaryLoading(false);
    }
  }, [requestedRunId, month]);

  const loadApartments = useCallback(async () => {
    setApartmentsLoading(true);
    setApartmentsError("");
    try {
      const result = await getApartments({ limit: 500 });
      setApartments(Array.isArray(result.items) ? result.items : []);
    } catch (requestError) {
      setApartments([]);
      setApartmentsError(
        getApiErrorMessage(requestError, "Unable to load apartments.")
      );
    } finally {
      setApartmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadApartments();
  }, [loadApartments]);

  const refresh = useCallback(async () => {
    await Promise.allSettled([loadSummary(), loadApartments()]);
  }, [loadSummary, loadApartments]);

  const selectRun = useCallback(
    (runId) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (runId) next.set("run", String(runId));
          else next.delete("run");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectMonth = useCallback(
    (value) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set("month", value);
          else next.delete("month");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const filters = useMemo(
    () => ({
      allocation_run_id: requestedRunId || undefined,
      billing_month: month || undefined,
    }),
    [requestedRunId, month]
  );

  const value = useMemo(
    () => ({
      summary,
      summaryLoading,
      summaryError,
      refresh,
      runOptions,
      selectedRunId,
      selectedRun,
      selectRun,
      month,
      selectMonth,
      filters,
      apartments,
      apartmentsLoading,
      apartmentsError,
      refreshApartments: loadApartments,
      periods: summary?.periods || [],
      latestPeriod: summary?.periods?.[0] || null,
      residentFlat: user?.flat_number || null,
      residentApartmentId: user?.apartment_id ?? null,
      config: {
        tariffs: summary?.tariff_revisions || [],
        configurations: summary?.billing_configurations || [],
        latest: summary?.latest_configuration || null,
      },
      disclaimer: summary?.disclaimer || "",
    }),
    [
      summary,
      summaryLoading,
      summaryError,
      refresh,
      runOptions,
      selectedRunId,
      selectedRun,
      selectRun,
      month,
      selectMonth,
      filters,
      apartments,
      apartmentsLoading,
      apartmentsError,
      loadApartments,
      user?.flat_number,
      user?.apartment_id,
    ]
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error("useBilling must be used inside BillingProvider.");
  }
  return context;
}
