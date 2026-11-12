export class ApiError extends Error {
  constructor(
    message,
    { status = 0, code = "network_error", details = null } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;

  if (error?.code === "ECONNABORTED") {
    return new ApiError(
      "The API request timed out. Check the backend and try again.",
      { code: "timeout" }
    );
  }

  if (!error?.response) {
    return new ApiError(
      "Cannot reach the India Green Grid API. Check that the backend is running.",
      { code: "network_error" }
    );
  }

  const { status, data } = error.response;
  return new ApiError(
    data?.error?.message || `Request failed with status ${status}.`,
    {
      status,
      code: data?.error?.code || `http_${status}`,
      details: data?.error?.details || null,
    }
  );
}

export function getApiErrorMessage(error, fallback = "Something went wrong.") {
  if (error instanceof ApiError) return error.message;
  if (error?.message) return error.message;
  return fallback;
}

export function getValidationDetails(error) {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return error.details
    .map((detail) => detail?.message)
    .filter(Boolean)
    .slice(0, 5);
}
