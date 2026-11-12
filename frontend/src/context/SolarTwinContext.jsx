import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../lib/apiError";
import {
  getApartmentSummary,
  getApartments,
  getRuns,
} from "../services/solarTwinService";

const SolarTwinContext = createContext(null);

export function SolarTwinProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");

  const [apartments, setApartments] = useState([]);
  const [apartmentSummary, setApartmentSummary] = useState(null);
  const [apartmentsLoading, setApartmentsLoading] = useState(true);
  const [apartmentsError, setApartmentsError] = useState("");

  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");

  const requestedRunId = Number(searchParams.get("run")) || null;

  const selectedRun = useMemo(() => {
    if (!runs.length) return null;
    return runs.find((run) => run.id === requestedRunId) || runs[0];
  }, [runs, requestedRunId]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError("");
    try {
      const result = await getRuns({ limit: 100 });
      setRuns(Array.isArray(result.items) ? result.items : []);
    } catch (requestError) {
      setRuns([]);
      setRunsError(
        getApiErrorMessage(requestError, "Unable to load simulation runs.")
      );
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const loadApartments = useCallback(async () => {
    setApartmentsLoading(true);
    setApartmentsError("");
    try {
      const [list, summary] = await Promise.all([
        getApartments({ limit: 500 }),
        getApartmentSummary(),
      ]);
      setApartments(Array.isArray(list.items) ? list.items : []);
      setApartmentSummary(summary || null);
    } catch (requestError) {
      setApartments([]);
      setApartmentSummary(null);
      setApartmentsError(
        getApiErrorMessage(requestError, "Unable to load apartments.")
      );
    } finally {
      setApartmentsLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async () => {
      await Promise.allSettled([loadRuns(), loadApartments()]);
    },
    [loadRuns, loadApartments]
  );

  useEffect(() => {
    loadRuns();
    loadApartments();
  }, [loadRuns, loadApartments]);

  useEffect(() => {
    if (!selectedRun) {
      setDateFromState("");
      setDateToState("");
      return;
    }
    setDateFromState(selectedRun.start_date);
    setDateToState(selectedRun.end_date);
  }, [selectedRun?.id]);

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

  const setDateFrom = useCallback((value) => {
    setDateFromState(value);
    setDateToState((current) =>
      current && value && current < value ? value : current
    );
  }, []);

  const setDateTo = useCallback((value) => {
    setDateToState(value);
    setDateFromState((current) =>
      current && value && current > value ? value : current
    );
  }, []);

  const resetDateRange = useCallback(() => {
    if (!selectedRun) return;
    setDateFromState(selectedRun.start_date);
    setDateToState(selectedRun.end_date);
  }, [selectedRun]);

  const value = useMemo(
    () => ({
      runs,
      runsLoading,
      runsError,
      selectedRun,
      runId: selectedRun?.id ?? null,
      selectRun,
      refresh,
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      resetDateRange,
      rangeValid:
        Boolean(dateFrom && dateTo) && (!dateFrom || !dateTo || dateFrom <= dateTo),
      apartments,
      apartmentSummary,
      apartmentsLoading,
      apartmentsError,
      refreshApartments: loadApartments,
    }),
    [
      runs,
      runsLoading,
      runsError,
      selectedRun,
      selectRun,
      refresh,
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      resetDateRange,
      apartments,
      apartmentSummary,
      apartmentsLoading,
      apartmentsError,
      loadApartments,
    ]
  );

  return (
    <SolarTwinContext.Provider value={value}>{children}</SolarTwinContext.Provider>
  );
}

export function useSolarTwin() {
  const context = useContext(SolarTwinContext);
  if (!context) {
    throw new Error("useSolarTwin must be used inside SolarTwinProvider.");
  }
  return context;
}
