import { useCallback, useSyncExternalStore } from "react";

export const FINE_POINTER_QUERY = "(pointer: fine) and (hover: hover)";
export const DESKTOP_CURSOR_QUERY =
  "(pointer: fine) and (hover: hover) and (min-width: 1024px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const registry = new Map();

function getEntry(query) {
  if (typeof window === "undefined" || !window.matchMedia) return null;

  let entry = registry.get(query);
  if (entry) return entry;

  const media = window.matchMedia(query);
  entry = { media, listeners: new Set() };

  entry.handleChange = (event) => {
    entry.listeners.forEach((listener) => listener(event.matches));
  };
  media.addEventListener?.("change", entry.handleChange);
  registry.set(query, entry);

  return entry;
}

export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onStoreChange) => {
      const entry = getEntry(query);
      if (!entry) return () => {};

      const listener = () => onStoreChange();
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    const entry = getEntry(query);
    return entry ? entry.media.matches : false;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useReducedMotionPreference() {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}

export function usePointerCapability() {
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const reducedMotion = useReducedMotionPreference();

  return {
    finePointer,
    reducedMotion,
    canAnimate: finePointer && !reducedMotion,
  };
}
