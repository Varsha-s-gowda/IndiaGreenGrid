import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../lib/apiError";
import { MODULES } from "../lib/modules";
import { getModuleStatus } from "../services/moduleService";

function createInitialState() {
  return Object.fromEntries(
    MODULES.map((module) => [
      module.key,
      module.implemented
        ? {
            loading: false,
            status: {
              available: true,
              status: "available",
              message: module.tagline,
            },
            error: "",
          }
        : { loading: true, status: null, error: "" },
    ])
  );
}

export default function useModuleStatuses({ enabled = true } = {}) {
  const [states, setStates] = useState(createInitialState);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadOne = useCallback(async (key) => {
    setStates((current) => ({
      ...current,
      [key]: { ...(current[key] || {}), loading: true, error: "" },
    }));

    try {
      const status = await getModuleStatus(key);
      if (!mounted.current) return;
      setStates((current) => ({
        ...current,
        [key]: { loading: false, status, error: "" },
      }));
    } catch (error) {
      if (!mounted.current) return;
      setStates((current) => ({
        ...current,
        [key]: {
          loading: false,
          status: null,
          error: getApiErrorMessage(error, "Unable to load module status."),
        },
      }));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setStates(createInitialState());
    await Promise.allSettled(
      MODULES.filter((module) => !module.implemented).map((module) =>
        loadOne(module.key)
      )
    );
  }, [loadOne]);

  useEffect(() => {
    if (!enabled) return;
    loadAll();
  }, [enabled, loadAll]);

  const reload = useCallback(
    (key) => {
      const module = MODULES.find((item) => item.key === key);
      if (module?.implemented) return Promise.resolve();
      return loadOne(key);
    },
    [loadOne]
  );

  return { states, reload, reloadAll: loadAll };
}
