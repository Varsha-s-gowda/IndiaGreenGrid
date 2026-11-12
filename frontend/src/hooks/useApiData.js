import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../lib/apiError";

export default function useApiData(fetcher, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");

    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch((requestError) => {
        if (!active) return;
        setData(null);
        setError(
          getApiErrorMessage(requestError, "Unable to load simulation data.")
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [...deps, enabled, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { data, loading, error, reload };
}
