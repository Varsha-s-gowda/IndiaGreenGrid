import { apiClient } from "../lib/apiClient";

function params(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

/* ------------------------------------------------------------------ solar */

export async function getInstallers({ search, state, page = 1, pageSize = 20 } = {}) {
  const { data } = await apiClient.get("/installers", {
    params: params({ search, state, page, page_size: pageSize }),
  });
  return data;
}

export async function getSolarRequests({
  status,
  state,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/solar-requests", {
    params: params({ status, state, search, page, page_size: pageSize }),
  });
  return data;
}

export async function getSolarRequest(requestId) {
  const { data } = await apiClient.get(`/solar-requests/${requestId}`);
  return data;
}

export async function createSolarRequest(payload) {
  const { data } = await apiClient.post("/solar-requests", payload);
  return data;
}

export async function acceptSolarRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/solar-requests/${requestId}/accept`, { note });
  return data;
}

export async function rejectSolarRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/solar-requests/${requestId}/reject`, { note });
  return data;
}

export async function scheduleSolarInspection(requestId, payload) {
  const { data } = await apiClient.post(
    `/solar-requests/${requestId}/schedule-inspection`,
    payload
  );
  return data;
}

export async function submitSolarQuotation(requestId, payload) {
  const { data } = await apiClient.post(
    `/solar-requests/${requestId}/quotations`,
    payload
  );
  return data;
}

export async function cancelSolarRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/solar-requests/${requestId}/cancel`, { note });
  return data;
}

export async function updateSolarProgress(requestId, payload) {
  const { data } = await apiClient.post(`/solar-requests/${requestId}/progress`, payload);
  return data;
}

export async function acceptQuotation(quotationId) {
  const { data } = await apiClient.post(`/solar-quotations/${quotationId}/accept`);
  return data;
}

export async function rejectQuotation(quotationId, note = "") {
  const { data } = await apiClient.post(`/solar-quotations/${quotationId}/reject`, { note });
  return data;
}

export async function withdrawQuotation(quotationId, note = "") {
  const { data } = await apiClient.post(`/solar-quotations/${quotationId}/withdraw`, {
    note,
  });
  return data;
}

export async function getSolarInstallations({ completed, page = 1, pageSize = 20 } = {}) {
  const { data } = await apiClient.get("/solar-installations", {
    params: params({ completed, page, page_size: pageSize }),
  });
  return data;
}

/* ------------------------------------------------------------- compliance */

export async function getComplianceRecords({
  status,
  year,
  month,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/compliance/records", {
    params: params({ status, year, month, search, page, page_size: pageSize }),
  });
  return data;
}

export async function getComplianceSummary() {
  const { data } = await apiClient.get("/compliance/summary");
  return data;
}

export async function createComplianceRecord(payload) {
  const { data } = await apiClient.post("/compliance/records", payload);
  return data;
}

export async function updateComplianceRecord(recordId, payload) {
  const { data } = await apiClient.put(`/compliance/records/${recordId}`, payload);
  return data;
}

export async function submitComplianceRecord(recordId) {
  const { data } = await apiClient.post(`/compliance/records/${recordId}/submit`);
  return data;
}

export async function reviewComplianceRecord(recordId, payload) {
  const { data } = await apiClient.post(`/compliance/records/${recordId}/review`, payload);
  return data;
}

/* ------------------------------------------------------------- procurement */

export async function getProcurementRequests({
  status,
  energyType,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/procurement/requests", {
    params: params({
      status,
      energy_type: energyType,
      search,
      page,
      page_size: pageSize,
    }),
  });
  return data;
}

export async function getProcurementRequest(requestId) {
  const { data } = await apiClient.get(`/procurement/requests/${requestId}`);
  return data;
}

export async function createProcurementRequest(payload) {
  const { data } = await apiClient.post("/procurement/requests", payload);
  return data;
}

export async function updateProcurementRequest(requestId, payload) {
  const { data } = await apiClient.put(`/procurement/requests/${requestId}`, payload);
  return data;
}

export async function publishProcurementRequest(requestId) {
  const { data } = await apiClient.post(`/procurement/requests/${requestId}/publish`);
  return data;
}

export async function closeProcurementRequest(requestId) {
  const { data } = await apiClient.post(`/procurement/requests/${requestId}/close`);
  return data;
}

export async function cancelProcurementRequest(requestId) {
  const { data } = await apiClient.post(`/procurement/requests/${requestId}/cancel`);
  return data;
}

export async function submitSupplierQuotation(requestId, payload) {
  const { data } = await apiClient.post(
    `/procurement/requests/${requestId}/quotations`,
    payload
  );
  return data;
}

export async function awardProcurementRequest(requestId, payload) {
  const { data } = await apiClient.post(`/procurement/requests/${requestId}/award`, payload);
  return data;
}

export async function getMyQuotations({ status, page = 1, pageSize = 20 } = {}) {
  const { data } = await apiClient.get("/procurement/quotations", {
    params: params({ status, page, page_size: pageSize }),
  });
  return data;
}

export async function withdrawSupplierQuotation(quotationId, note = "") {
  const { data } = await apiClient.post(
    `/procurement/quotations/${quotationId}/withdraw`,
    { note }
  );
  return data;
}

/* ------------------------------------------------------------------ loans */

export async function getLoanProducts({
  mine = false,
  search,
  activeOnly = true,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/loan-products", {
    params: params({
      mine,
      search,
      active_only: activeOnly,
      page,
      page_size: pageSize,
    }),
  });
  return data;
}

export async function createLoanProduct(payload) {
  const { data } = await apiClient.post("/loan-products", payload);
  return data;
}

export async function updateLoanProduct(productId, payload) {
  const { data } = await apiClient.put(`/loan-products/${productId}`, payload);
  return data;
}

export async function getLoanApplications({
  status,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/loan-applications", {
    params: params({ status, search, page, page_size: pageSize }),
  });
  return data;
}

export async function getLoanApplication(applicationId) {
  const { data } = await apiClient.get(`/loan-applications/${applicationId}`);
  return data;
}

export async function createLoanApplication(payload) {
  const { data } = await apiClient.post("/loan-applications", payload);
  return data;
}

export async function decideLoanApplication(applicationId, payload) {
  const { data } = await apiClient.post(
    `/loan-applications/${applicationId}/decision`,
    payload
  );
  return data;
}

export async function resubmitLoanApplication(applicationId) {
  const { data } = await apiClient.post(`/loan-applications/${applicationId}/resubmit`);
  return data;
}

export async function withdrawLoanApplication(applicationId) {
  const { data } = await apiClient.post(`/loan-applications/${applicationId}/withdraw`);
  return data;
}

export async function getInstitutionLoanSummary() {
  const { data } = await apiClient.get("/loan-applications/summary/financier");
  return data;
}

/* --------------------------------------------------------------- recycling */

export async function getRecyclingCategories() {
  const { data } = await apiClient.get("/recycling-requests/categories");
  return data;
}

export async function getRecyclingRequests({
  status,
  wasteCategory,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/recycling-requests", {
    params: params({
      status,
      waste_category: wasteCategory,
      search,
      page,
      page_size: pageSize,
    }),
  });
  return data;
}

export async function getRecyclingRequest(requestId) {
  const { data } = await apiClient.get(`/recycling-requests/${requestId}`);
  return data;
}

export async function createRecyclingRequest(payload) {
  const { data } = await apiClient.post("/recycling-requests", payload);
  return data;
}

export async function getRecyclingAnalytics() {
  const { data } = await apiClient.get("/recycling-requests/analytics");
  return data;
}

export async function acceptRecyclingRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/accept`, {
    note,
  });
  return data;
}

export async function rejectRecyclingRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/reject`, {
    note,
  });
  return data;
}

export async function scheduleRecyclingPickup(requestId, payload) {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/schedule`, payload);
  return data;
}

export async function recordRecyclingCollection(requestId, payload) {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/collect`, payload);
  return data;
}

export async function recordRecyclingProcessing(requestId, payload) {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/process`, payload);
  return data;
}

export async function completeRecyclingRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/complete`, {
    note,
  });
  return data;
}

export async function cancelRecyclingRequest(requestId, note = "") {
  const { data } = await apiClient.post(`/recycling-requests/${requestId}/cancel`, {
    note,
  });
  return data;
}

/* ----------------------------------------------------------- organisations */

export async function getMyOrganisation() {
  const { data } = await apiClient.get("/organisations/me");
  return data;
}

export async function updateMyOrganisation(payload) {
  const { data } = await apiClient.put("/organisations/me", payload);
  return data;
}

export async function submitMyOrganisation() {
  const { data } = await apiClient.post("/organisations/me/submit");
  return data;
}

export async function getOrganisations({
  status,
  organisationType,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/organisations", {
    params: params({
      status,
      organisation_type: organisationType,
      search,
      page,
      page_size: pageSize,
    }),
  });
  return data;
}

export async function getOrganisation(organisationId) {
  const { data } = await apiClient.get(`/organisations/${organisationId}`);
  return data;
}

export async function getOrganisationHistory(organisationId) {
  const { data } = await apiClient.get(`/organisations/${organisationId}/history`);
  return data;
}

export async function reviewOrganisation(organisationId, payload) {
  const { data } = await apiClient.post(
    `/organisations/${organisationId}/review`,
    payload
  );
  return data;
}

export async function getPlatformOverview() {
  const { data } = await apiClient.get("/platform/overview");
  return data;
}

export async function getPolicyAggregates() {
  const { data } = await apiClient.get("/platform/policy-aggregates");
  return data;
}

/* --------------------------------------------------------- notifications */

export async function getNotifications({
  unreadOnly = false,
  category,
  page = 1,
  pageSize = 20,
} = {}) {
  const { data } = await apiClient.get("/notifications", {
    params: params({
      unread_only: unreadOnly,
      category,
      page,
      page_size: pageSize,
    }),
  });
  return data;
}

export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get("/notifications/unread-count");
  return data;
}

export async function markNotificationRead(notificationId) {
  const { data } = await apiClient.post(`/notifications/${notificationId}/read`);
  return data;
}

export async function markNotificationUnread(notificationId) {
  const { data } = await apiClient.post(`/notifications/${notificationId}/unread`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.post("/notifications/read-all");
  return data;
}

/* ------------------------------------------------------------- documents */

export async function uploadDocument({
  entityType,
  entityId,
  documentType = "SUPPORTING",
  file,
}) {
  const form = new FormData();
  form.append("entity_type", entityType);
  form.append("entity_id", String(entityId));
  form.append("document_type", documentType);
  form.append("file", file);
  const { data } = await apiClient.post("/documents/upload", form);
  return data;
}

export async function getDocuments({ entityType, entityId }) {
  const { data } = await apiClient.get("/documents", {
    params: { entity_type: entityType, entity_id: entityId },
  });
  return data;
}

export async function reviewDocument(documentId, { status = "ACCEPTED", note = "" } = {}) {
  const { data } = await apiClient.post(`/documents/${documentId}/review`, null, {
    params: params({ status, note }),
  });
  return data;
}

export async function downloadDocument(documentId, fileName) {
  const response = await apiClient.get(`/documents/${documentId}/download`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || `document-${documentId}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
