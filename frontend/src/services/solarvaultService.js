import { apiClient } from "../lib/apiClient";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export async function getSolarVaultStatus() {
  const { data } = await apiClient.get("/solarvault/status");
  return data;
}

export async function getBatteryConfiguration() {
  const { data } = await apiClient.get("/solarvault/configuration");
  return data;
}

export async function updateBatteryConfiguration(payload) {
  const { data } = await apiClient.put("/solarvault/configuration", payload);
  return data;
}

export async function runBatterySimulation(payload) {
  const { data } = await apiClient.post("/solarvault/simulate", payload);
  return data;
}

export async function getBatterySummary() {
  const { data } = await apiClient.get("/solarvault/summary");
  return data;
}

export async function getBatteryHourly(params = {}) {
  const { data } = await apiClient.get("/solarvault/hourly", {
    params: cleanParams(params),
  });
  return data;
}

export async function getBatteryHistory(params = {}) {
  const { data } = await apiClient.get("/solarvault/history", {
    params: cleanParams(params),
  });
  return data;
}

export async function getBatteryComparison(params = {}) {
  const { data } = await apiClient.get("/solarvault/compare", {
    params: cleanParams(params),
  });
  return data;
}

export async function getBatterySimulation(simulationId) {
  const { data } = await apiClient.get(
    `/solarvault/simulations/${encodeURIComponent(simulationId)}`
  );
  return data;
}
