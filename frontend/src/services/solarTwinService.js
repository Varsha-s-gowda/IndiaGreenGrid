import { apiClient } from "../lib/apiClient";

const MAX_LIST_PAGE_SIZE = 10000;
const MAX_BULK_PAGES = 60;

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

async function getListPage(path, params, pageSize, offset) {
  const { data } = await apiClient.get(path, {
    params: cleanParams({ ...params, limit: pageSize, offset }),
  });
  return data;
}

async function getAllPages(path, params = {}, pageSize = MAX_LIST_PAGE_SIZE) {
  const first = await getListPage(path, params, pageSize, 0);
  const total = Number(first.total) || 0;
  const items = Array.isArray(first.items) ? first.items : [];

  if (!total || items.length >= total) {
    return { ...first, loaded: items.length, truncated: false };
  }

  const remainingPages = Math.min(
    Math.ceil((total - items.length) / pageSize),
    MAX_BULK_PAGES
  );

  const pages = await Promise.all(
    Array.from({ length: remainingPages }, (_, index) =>
      getListPage(path, params, pageSize, (index + 1) * pageSize)
    )
  );

  const allItems = items.concat(
    ...pages.map((page) => (Array.isArray(page.items) ? page.items : []))
  );

  return {
    ...first,
    items: allItems,
    loaded: allItems.length,
    truncated: allItems.length < total,
  };
}

export async function getApartments(params = {}) {
  const { data } = await apiClient.get("/apartments", {
    params: cleanParams(params),
  });
  return data;
}

export async function getApartmentSummary() {
  const { data } = await apiClient.get("/apartments/summary");
  return data;
}

export async function getRuns(params = {}) {
  const { data } = await apiClient.get("/simulation/runs", {
    params: cleanParams(params),
  });
  return data;
}

export async function getRun(runId) {
  const { data } = await apiClient.get(`/simulation/runs/${runId}`);
  return data;
}

export async function getSimulationSummary(params = {}) {
  const { data } = await apiClient.get("/simulation/summary", {
    params: cleanParams(params),
  });
  return data;
}

export async function getHourlyBalance(params = {}) {
  const { data } = await apiClient.get("/simulation/hourly", {
    params: cleanParams(params),
  });
  return data;
}

export async function getDailyBalance(params = {}) {
  const { data } = await apiClient.get("/simulation/daily", {
    params: cleanParams(params),
  });
  return data;
}

export async function getMonthlyBalance(params = {}) {
  const { data } = await apiClient.get("/simulation/monthly", {
    params: cleanParams(params),
  });
  return data;
}

export async function getSolarGeneration(params = {}) {
  return getAllPages("/simulation/solar-generation", params);
}

export async function getApartmentConsumption(params = {}) {
  return getAllPages("/simulation/consumption", params);
}

export async function getCommonConsumption(params = {}) {
  return getAllPages("/simulation/common-consumption", params);
}

export async function generateSimulation(payload) {
  const { data } = await apiClient.post("/simulation/generate", payload);
  return data;
}

export async function generateSolar(payload) {
  const { data } = await apiClient.post("/simulation/generate-solar", payload);
  return data;
}

export async function generateConsumption(payload) {
  const { data } = await apiClient.post(
    "/simulation/generate-consumption",
    payload
  );
  return data;
}

export async function deleteSimulationRun(runId) {
  const { data } = await apiClient.delete(`/simulation/runs/${runId}`);
  return data;
}
