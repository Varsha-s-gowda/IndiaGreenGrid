import { apiClient } from "../lib/apiClient";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export async function getBillingStatus() {
  const { data } = await apiClient.get("/billing/status");
  return data;
}

export async function generateBills(payload) {
  const { data } = await apiClient.post("/billing/generate", payload);
  return data;
}

export async function getBillingSummary(params = {}) {
  const { data } = await apiClient.get("/billing/summary", {
    params: cleanParams(params),
  });
  return data;
}

export async function getBillingFlats(params = {}) {
  const { data } = await apiClient.get("/billing/flats", {
    params: cleanParams(params),
  });
  return data;
}

export async function getFlatBilling(flatRef, params = {}) {
  const { data } = await apiClient.get(
    `/billing/flats/${encodeURIComponent(flatRef)}`,
    { params: cleanParams(params) }
  );
  return data;
}

export async function getBill(billId) {
  const { data } = await apiClient.get(`/billing/bills/${billId}`);
  return data;
}

function filenameFromHeaders(headers, fallback) {
  const disposition = headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadBillPdf(billId, billNumber) {
  const response = await apiClient.get(`/billing/bills/${billId}/pdf`, {
    responseType: "blob",
  });
  const filename = filenameFromHeaders(
    response.headers,
    `BillFair-${billNumber || billId}.pdf`
  );
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  return { blob: response.data, filename };
}

export async function getBillingHistory(flatRef, params = {}) {
  const { data } = await apiClient.get(
    `/billing/history/${encodeURIComponent(flatRef)}`,
    { params: cleanParams(params) }
  );
  return data;
}

export async function runBillingAudit(payload) {
  const { data } = await apiClient.post("/billing/audits", payload);
  return data;
}

export async function getBillingAudits(params = {}) {
  const { data } = await apiClient.get("/billing/audits", {
    params: cleanParams(params),
  });
  return data;
}

export async function reviewBillingAudit(auditId, payload) {
  const { data } = await apiClient.post(
    `/billing/audits/${auditId}/review`,
    payload
  );
  return data;
}

export async function getBillingConfig() {
  const { data } = await apiClient.get("/billing/config");
  return data;
}

export async function createBillingConfig(payload) {
  const { data } = await apiClient.post("/billing/config", payload);
  return data;
}

export async function createTariffRevision(payload) {
  const { data } = await apiClient.post("/billing/tariffs", payload);
  return data;
}
