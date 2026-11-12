const TOKEN_KEY = "solarequity360.access_token";

let memoryToken = null;

function storageAvailable() {
  try {
    return typeof window !== "undefined" && Boolean(window.sessionStorage);
  } catch {
    return false;
  }
}

export function getToken() {
  if (memoryToken) return memoryToken;
  if (!storageAvailable()) return null;
  try {
    memoryToken = window.sessionStorage.getItem(TOKEN_KEY);
    return memoryToken;
  } catch {
    return null;
  }
}

export function setToken(token) {
  memoryToken = token || null;
  if (!storageAvailable()) return;
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
  }
}

export function clearToken() {
  setToken(null);
}

function decodeBase64Url(value) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const encoded = Array.from(binary)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");
  return decodeURIComponent(encoded);
}

export function getTokenPayload() {
  const token = getToken();
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }
}

export function getTokenExpiry() {
  const payload = getTokenPayload();
  if (!payload?.exp) return null;
  return new Date(payload.exp * 1000);
}
