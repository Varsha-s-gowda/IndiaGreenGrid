import { apiClient } from "../lib/apiClient";

export async function login(credentials) {
  const { data } = await apiClient.post("/auth/login", credentials);
  return data;
}

export async function register(payload) {
  const { data } = await apiClient.post("/auth/register", payload);
  return data;
}

export async function getCurrentUser() {
  const { data } = await apiClient.get("/auth/me");
  return data;
}
