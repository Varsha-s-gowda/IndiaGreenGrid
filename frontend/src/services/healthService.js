import { apiClient } from "../lib/apiClient";

export async function getHealth() {
  const { data } = await apiClient.get("/health");
  return data;
}

export async function getDatabaseHealth() {
  const { data } = await apiClient.get("/health/database");
  return data;
}
