import axios from "axios";
import { normalizeApiError } from "./apiError";
import { clearToken, getToken } from "./authStorage";
import { API_BASE_URL } from "./config";

const AUTH_ENDPOINTS = ["/auth/login", "/auth/register"];

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let expiredEventSent = false;

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path));

    if (status === 401 && !isAuthEndpoint && getToken()) {
      clearToken();
      if (!expiredEventSent) {
        expiredEventSent = true;
        window.dispatchEvent(new Event("solarequity:session-expired"));
        window.setTimeout(() => {
          expiredEventSent = false;
        }, 1500);
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);
