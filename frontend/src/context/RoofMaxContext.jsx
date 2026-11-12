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
import { getRuns } from "../services/solarTwinService";
import {
  getAnalysis,
  getAnalysisHistory,
  getRecommendation,
  getRoofConfiguration,
} from "../services/roofmaxService";

const RoofMaxContext = createContext(null);

export function RoofMaxProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  const requestedRunId = Number(searchParams.get("run")) || null;
  const requestedAnalysisId = Number(searchParams.get("analysis")) || null;

  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [configuration, setConfiguration] = useState(null);
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState("");

  const [history, setHistory] = useState({ total: 0, limit: 50, offset: 0, items: [] });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const runOptions = useMemo(
    () => runs.filter((run) => run.status === "COMPLETED"),
    [runs]
  );

  const selectedRunId = useMemo(() => {
    if (requestedRunId) return requestedRunId;
    return runOptions[0]?.id ?? null;
  }, [requestedRunId, runOptions]);

  const selectedRun = useMemo(
    () => runOptions.find((run) => run.id === selectedRunId) || null,
    [runOptions, selectedRunId]
  );

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError("");
    try {
      const result = await getRuns({ limit: 100 });
      setRuns(Array.isArray(result.items) ? result.items : []);
    } catch (requestError) {
      setRuns([]);
      setRunsError(
        getApiErrorMessage(requestError, "Unable to load SolarTwin runs.")
      );
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    setDetailError("");
    setNotFound(false);
    try {
      const result = requestedAnalysisId
        ? await getAnalysis(requestedAnalysisId)
        : await getRecommendation();
      setDetail(result);
    } catch (requestError) {
      setDetail(null);
      if (requestError?.status === 404 && !requestedAnalysisId) {
        setNotFound(true);
      } else {
        setDetailError(
          getApiErrorMessage(
            requestError,
            requestedAnalysisId
              ? "Unable to load the selected analysis."
              : "Unable to load the RoofMax recommendation."
          )
        );
      }
    } finally {
      setDetailLoading(false);
    }
  }, [requestedAnalysisId]);

  const loadConfiguration = useCallback(async () => {
    setConfigurationLoading(true);
    setConfigurationError("");
    try {
      const result = await getRoofConfiguration();
      setConfiguration(result.configuration);
    } catch (requestError) {
      setConfiguration(null);
      setConfigurationError(
        getApiErrorMessage(
          requestError,
          "Unable to load the RoofMax configuration."
        )
      );
    } finally {
      setConfigurationLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await getAnalysisHistory({
        simulation_run_id: selectedRunId || undefined,
        limit: 50,
      });
      setHistory(result);
    } catch (requestError) {
      setHistory({ total: 0, limit: 50, offset: 0, items: [] });
      setHistoryError(
        getApiErrorMessage(requestError, "Unable to load RoofMax history.")
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const refresh = useCallback(async () => {
    await Promise.allSettled([loadDetail(), loadConfiguration(), loadHistory()]);
  }, [loadDetail, loadConfiguration, loadHistory]);

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

  const selectAnalysis = useCallback(
    (analysisId) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (analysisId) next.set("analysis", String(analysisId));
          else next.delete("analysis");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const analysis = detail?.analysis || null;

  const value = useMemo(
    () => ({
      isAdmin,
      runs,
      runOptions,
      runsLoading,
      runsError,
      selectedRunId,
      selectedRun,
      selectRun,
      requestedAnalysisId,
      selectAnalysis,
      detail,
      analysis,
      scenarios: analysis?.scenarios || [],
      detailLoading,
      detailError,
      notFound,
      configuration,
      configurationLoading,
      configurationError,
      refresh,
      reloadConfiguration: loadConfiguration,
      history: history.items || [],
      historyTotal: history.total || 0,
      historyLoading,
      historyError,
      refreshHistory: loadHistory,
      limitations: detail?.limitations || analysis?.limitations || [],
      disclaimer: detail?.disclaimer || "",
    }),
    [
      isAdmin,
      runs,
      runOptions,
      runsLoading,
      runsError,
      selectedRunId,
      selectedRun,
      selectRun,
      requestedAnalysisId,
      selectAnalysis,
      detail,
      analysis,
      detailLoading,
      detailError,
      notFound,
      configuration,
      configurationLoading,
      configurationError,
      refresh,
      loadConfiguration,
      history.items,
      history.total,
      historyLoading,
      historyError,
      loadHistory,
    ]
  );

  return (
    <RoofMaxContext.Provider value={value}>{children}</RoofMaxContext.Provider>
  );
}

export function useRoofMax() {
  const context = useContext(RoofMaxContext);
  if (!context) {
    throw new Error("useRoofMax must be used inside RoofMaxProvider.");
  }
  return context;
}
