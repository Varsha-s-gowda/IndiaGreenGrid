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
  getBatteryConfiguration,
  getBatteryHistory,
  getBatterySimulation,
  getBatterySummary,
} from "../services/solarvaultService";

const SolarVaultContext = createContext(null);

function deriveOverview(simulation) {
  if (!simulation) return null;
  const capacity = Number(simulation.capacity_kwh || 0);
  const finalSoc = Number(simulation.final_soc_pct || 0);
  const minSoc = Number(simulation.min_soc_pct || 0);
  const maxSoc = Number(simulation.max_soc_pct || 0);
  let batteryStatus = "IDLE";
  if (capacity <= 0) batteryStatus = "DISABLED";
  else if (finalSoc >= maxSoc - 1e-6) batteryStatus = "FULL";
  else if (finalSoc <= minSoc + 1e-6) batteryStatus = "DEPLETED";
  return {
    battery_status: batteryStatus,
    current_soc_pct: finalSoc,
    stored_energy_kwh: Number(simulation.final_stored_kwh || 0),
    capacity_kwh: capacity,
    usable_capacity_kwh: Number(simulation.configuration?.usable_capacity_kwh || 0),
    charged_kwh: Number(simulation.total_charged_kwh || 0),
    discharged_kwh: Number(simulation.total_discharged_kwh || 0),
    grid_reduction_kwh: Number(simulation.grid_reduction_kwh || 0),
    grid_reduction_pct: Number(simulation.grid_reduction_pct || 0),
    solar_utilization_pct: Number(simulation.solar_utilization_pct || 0),
    estimated_savings: Number(simulation.estimated_savings || 0),
    last_record_time: null,
  };
}

export function SolarVaultProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  const requestedRunId = Number(searchParams.get("run")) || null;
  const requestedSimulationId = Number(searchParams.get("simulation")) || null;

  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [configuration, setConfiguration] = useState(null);
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState("");

  const [history, setHistory] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    items: [],
  });
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

  const activeSimulationId = useMemo(() => {
    if (requestedSimulationId) return requestedSimulationId;
    return summary?.simulation?.id ?? null;
  }, [requestedSimulationId, summary]);

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

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    setNotFound(false);
    try {
      const result = await getBatterySummary();
      setSummary(result);
    } catch (requestError) {
      setSummary(null);
      if (requestError?.status === 404) {
        setNotFound(true);
      } else {
        setSummaryError(
          getApiErrorMessage(
            requestError,
            "Unable to load the SolarVault summary."
          )
        );
      }
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!activeSimulationId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await getBatterySimulation(activeSimulationId);
      setDetail(result);
    } catch (requestError) {
      setDetail(null);
      setDetailError(
        getApiErrorMessage(
          requestError,
          "Unable to load the selected simulation."
        )
      );
    } finally {
      setDetailLoading(false);
    }
  }, [activeSimulationId]);

  const loadConfiguration = useCallback(async () => {
    setConfigurationLoading(true);
    setConfigurationError("");
    try {
      const result = await getBatteryConfiguration();
      setConfiguration(result.configuration);
    } catch (requestError) {
      setConfiguration(null);
      setConfigurationError(
        getApiErrorMessage(
          requestError,
          "Unable to load the battery configuration."
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
      const result = await getBatteryHistory({
        simulation_run_id: selectedRunId || undefined,
        limit: 50,
      });
      setHistory(result);
    } catch (requestError) {
      setHistory({ total: 0, limit: 50, offset: 0, items: [] });
      setHistoryError(
        getApiErrorMessage(requestError, "Unable to load SolarVault history.")
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

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
    await Promise.allSettled([
      loadSummary(),
      loadConfiguration(),
      loadHistory(),
      loadDetail(),
    ]);
  }, [loadSummary, loadConfiguration, loadHistory, loadDetail]);

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

  const selectSimulation = useCallback(
    (simulationId) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (simulationId) next.set("simulation", String(simulationId));
          else next.delete("simulation");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectedDetail = useMemo(() => {
    if (!detail) return null;
    if (!requestedSimulationId) return detail;
    return detail.simulation?.id === requestedSimulationId ? detail : null;
  }, [detail, requestedSimulationId]);

  const simulation = requestedSimulationId
    ? selectedDetail?.simulation || null
    : detail?.simulation || summary?.simulation || null;
  const comparison = requestedSimulationId
    ? selectedDetail?.comparison || null
    : detail?.comparison || summary?.comparison || null;
  const hourly = selectedDetail?.hourly || [];
  const overview = useMemo(() => {
    if (!simulation) return null;
    if (!requestedSimulationId && summary?.overview) return summary.overview;
    return deriveOverview(simulation);
  }, [simulation, requestedSimulationId, summary]);

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
      requestedSimulationId,
      activeSimulationId,
      selectSimulation,
      summary,
      summaryLoading,
      summaryError,
      notFound,
      detail,
      detailLoading,
      detailError,
      simulation,
      comparison,
      hourly,
      overview,
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
      limitations:
        selectedDetail?.limitations || summary?.limitations || [],
      disclaimer: selectedDetail?.disclaimer || summary?.disclaimer || "",
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
      requestedSimulationId,
      activeSimulationId,
      selectSimulation,
      summary,
      summaryLoading,
      summaryError,
      notFound,
      detail,
      detailLoading,
      detailError,
      simulation,
      comparison,
      hourly,
      overview,
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
      selectedDetail,
      summary?.limitations,
      summary?.disclaimer,
    ]
  );

  return (
    <SolarVaultContext.Provider value={value}>
      {children}
    </SolarVaultContext.Provider>
  );
}

export function useSolarVault() {
  const context = useContext(SolarVaultContext);
  if (!context) {
    throw new Error("useSolarVault must be used inside SolarVaultProvider.");
  }
  return context;
}
