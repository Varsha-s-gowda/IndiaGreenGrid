import { apiClient } from "../lib/apiClient";

function params(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export async function getDashboardOverview() {
  const { data } = await apiClient.get("/dashboard/overview");
  return data;
}

export async function getEnergyOverview({ year } = {}) {
  const { data } = await apiClient.get("/energy/overview", {
    params: params({ year }),
  });
  return data;
}

export async function getEnergySourceHistory(sourceCode) {
  const { data } = await apiClient.get(`/energy/sources/${sourceCode}/history`);
  return data;
}

export async function getRpoOverview() {
  const { data } = await apiClient.get("/rpo/overview");
  return data;
}

export async function getRpoTargets() {
  const { data } = await apiClient.get("/rpo/targets");
  return data;
}

export async function createRpoTarget(payload) {
  const { data } = await apiClient.post("/rpo/targets", payload);
  return data;
}

export async function updateRpoTarget(targetId, payload) {
  const { data } = await apiClient.patch(`/rpo/targets/${targetId}`, payload);
  return data;
}

export async function recordRpoCompliance(targetId, payload) {
  const { data } = await apiClient.post(
    `/rpo/targets/${targetId}/compliance`,
    payload
  );
  return data;
}

export async function getRpoTargetHistory(targetId) {
  const { data } = await apiClient.get(`/rpo/targets/${targetId}/history`);
  return data;
}

export async function getSolarOptions() {
  const { data } = await apiClient.get("/solar/state-options");
  return data;
}

export async function calculateSolar(payload) {
  const { data } = await apiClient.post("/solar/calculate", payload);
  return data;
}

export async function getSolarCalculations({ limit = 20 } = {}) {
  const { data } = await apiClient.get("/solar/calculations", {
    params: params({ limit }),
  });
  return data;
}

export async function getJobs(filters = {}) {
  const { data } = await apiClient.get("/jobs", { params: params(filters) });
  return data;
}

export async function getJob(jobId) {
  const { data } = await apiClient.get(`/jobs/${jobId}`);
  return data;
}

export async function getMyApplications() {
  const { data } = await apiClient.get("/jobs/applications/me");
  return data;
}

export async function applyToJob(jobId, payload) {
  const { data } = await apiClient.post(`/jobs/${jobId}/apply`, payload);
  return data;
}

export async function getAdminJobs() {
  const { data } = await apiClient.get("/jobs/admin/all");
  return data;
}

export async function createJob(payload) {
  const { data } = await apiClient.post("/jobs", payload);
  return data;
}

export async function updateJob(jobId, payload) {
  const { data } = await apiClient.patch(`/jobs/${jobId}`, payload);
  return data;
}

export async function getFinanceSchemes(filters = {}) {
  const { data } = await apiClient.get("/finance/schemes", {
    params: params(filters),
  });
  return data;
}

export async function getFinanceScheme(schemeId) {
  const { data } = await apiClient.get(`/finance/schemes/${schemeId}`);
  return data;
}

export async function compareFinanceSchemes(ids) {
  const { data } = await apiClient.get("/finance/compare", {
    params: { ids: ids.join(",") },
  });
  return data;
}

export async function getAdminFinanceSchemes() {
  const { data } = await apiClient.get("/finance/admin/all");
  return data;
}

export async function createFinanceScheme(payload) {
  const { data } = await apiClient.post("/finance/schemes", payload);
  return data;
}

export async function updateFinanceScheme(schemeId, payload) {
  const { data } = await apiClient.patch(
    `/finance/schemes/${schemeId}`,
    payload
  );
  return data;
}

export async function getCircularSummary() {
  const { data } = await apiClient.get("/circular/summary");
  return data;
}

export async function getRecyclers(filters = {}) {
  const { data } = await apiClient.get("/circular/recyclers", {
    params: params(filters),
  });
  return data;
}

export async function getRecyclingTransactions(filters = {}) {
  const { data } = await apiClient.get("/circular/transactions", {
    params: params(filters),
  });
  return data;
}

export async function createRecyclingTransaction(payload) {
  const { data } = await apiClient.post("/circular/transactions", payload);
  return data;
}

export async function updateRecyclingTransaction(transactionId, payload) {
  const { data } = await apiClient.patch(
    `/circular/transactions/${transactionId}`,
    payload
  );
  return data;
}

export async function getRecyclingTransaction(transactionId) {
  const { data } = await apiClient.get(
    `/circular/transactions/${transactionId}`
  );
  return data;
}

export async function createRecycler(payload) {
  const { data } = await apiClient.post("/circular/recyclers", payload);
  return data;
}

export async function updateRecycler(recyclerId, payload) {
  const { data } = await apiClient.patch(
    `/circular/recyclers/${recyclerId}`,
    payload
  );
  return data;
}

export async function getImpactOverview() {
  const { data } = await apiClient.get("/impact/overview");
  return data;
}

export async function getForecastLocations() {
  const { data } = await apiClient.get("/forecast/locations");
  return data;
}

export async function estimateForecast(payload) {
  const { data } = await apiClient.post("/forecast/estimate", payload);
  return data;
}

export async function getForecastHistory() {
  const { data } = await apiClient.get("/forecast/history");
  return data;
}

export async function getAdminOverview() {
  const { data } = await apiClient.get("/admin/overview");
  return data;
}

export async function getAdminUsers(filters = {}) {
  const { data } = await apiClient.get("/admin/users", {
    params: params(filters),
  });
  return data;
}

export async function getAdminApprovals() {
  const { data } = await apiClient.get("/admin/approvals");
  return data;
}

export async function updateAdminUser(userId, payload) {
  const { data } = await apiClient.patch(`/admin/users/${userId}`, payload);
  return data;
}

export async function getDataSources() {
  const { data } = await apiClient.get("/admin/data-sources");
  return data;
}

export async function getIngestionRuns({ limit = 100 } = {}) {
  const { data } = await apiClient.get("/admin/ingestion-runs", {
    params: params({ limit }),
  });
  return data;
}

export async function refreshDataSource(sourceId) {
  const { data } = await apiClient.post(
    `/admin/data-sources/${sourceId}/refresh`
  );
  return data;
}

export async function refreshAllDataSources() {
  const { data } = await apiClient.post("/admin/data-sources/refresh-all");
  return data;
}

export async function getAdminActivity({ limit = 50 } = {}) {
  const { data } = await apiClient.get("/admin/activity", {
    params: params({ limit }),
  });
  return data;
}

export async function getModuleUsage({ days = 30 } = {}) {
  const { data } = await apiClient.get("/admin/module-usage", {
    params: params({ days }),
  });
  return data;
}

export async function updateProfile(payload) {
  const { data } = await apiClient.put("/auth/profile", payload);
  return data;
}

export async function changePassword(payload) {
  const { data } = await apiClient.post("/auth/change-password", payload);
  return data;
}
