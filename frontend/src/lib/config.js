export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api"
).replace(/\/+$/, "");

export const API_ORIGIN = /^https?:\/\//i.test(API_BASE_URL)
  ? API_BASE_URL.replace(/\/api$/i, "")
  : "";

export const SWAGGER_URL = API_ORIGIN
  ? `${API_ORIGIN}/docs`
  : "http://localhost:8000/docs";

export const HEALTH_POLL_INTERVAL_MS = 30000;
export const MAX_HEALTH_SAMPLES = 20;
