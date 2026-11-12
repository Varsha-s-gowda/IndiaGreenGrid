import { apiClient } from "../lib/apiClient";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export async function getRoofMaxStatus() {
  const { data } = await apiClient.get("/roofmax/status");
  return data;
}

export async function getRoofConfiguration() {
  const { data } = await apiClient.get("/roofmax/configuration");
  return data;
}

export async function updateRoofConfiguration(payload) {
  const { data } = await apiClient.put("/roofmax/configuration", payload);
  return data;
}

export async function analyzeRoofCapacity(payload) {
  const { data } = await apiClient.post("/roofmax/analyze", payload);
  return data;
}

export async function getRecommendation() {
  const { data } = await apiClient.get("/roofmax/recommendation");
  return data;
}

export async function getScenarios(params = {}) {
  const { data } = await apiClient.get("/roofmax/scenarios", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAnalysisHistory(params = {}) {
  const { data } = await apiClient.get("/roofmax/history", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAnalysis(analysisId) {
  const { data } = await apiClient.get(
    `/roofmax/analysis/${encodeURIComponent(analysisId)}`
  );
  return data;
}
