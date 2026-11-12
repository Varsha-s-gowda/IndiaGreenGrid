import { apiClient } from "../lib/apiClient";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export async function getAllocationStatus() {
  const { data } = await apiClient.get("/allocation/status");
  return data;
}

export async function calculateAllocation(payload) {
  const { data } = await apiClient.post("/allocation/calculate", payload);
  return data;
}

export async function getComparison(params = {}) {
  const { data } = await apiClient.get("/allocation/compare", {
    params: cleanParams(params),
  });
  return data;
}

export async function postComparison(payload) {
  const { data } = await apiClient.post("/allocation/compare", payload);
  return data;
}

export async function getAllocationRuns(params = {}) {
  const { data } = await apiClient.get("/allocation/runs", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAllocationRunDetail(runId) {
  const { data } = await apiClient.get(`/allocation/runs/${runId}`);
  return data;
}

export async function getFairness(params = {}) {
  const { data } = await apiClient.get("/allocation/fairness", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAllocationHourly(params = {}) {
  const { data } = await apiClient.get("/allocation/hourly", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAllocationDaily(params = {}) {
  const { data } = await apiClient.get("/allocation/daily", {
    params: cleanParams(params),
  });
  return data;
}

export async function getAllocationMonthly(params = {}) {
  const { data } = await apiClient.get("/allocation/monthly", {
    params: cleanParams(params),
  });
  return data;
}

export async function getApartmentAllocation(flatRef, params = {}) {
  const { data } = await apiClient.get(
    `/allocation/${encodeURIComponent(flatRef)}`,
    { params: cleanParams(params) }
  );
  return data;
}
