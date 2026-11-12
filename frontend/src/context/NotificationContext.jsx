import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ToastViewport from "../components/notifications/ToastViewport";

const NotificationContext = createContext(null);
const ENABLED_KEY = "solarequity360.notifications-enabled";
const MAX_NOTIFICATIONS = 30;
const TOAST_DURATION_MS = 5000;

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readEnabled() {
  try {
    return window.localStorage.getItem(ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function NotificationProvider({ children }) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ title, message, type = "info", source = "System" }) => {
      if (!enabled) return null;

      const item = {
        id: createId(),
        title,
        message,
        type,
        source,
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((current) => [item, ...current].slice(0, MAX_NOTIFICATIONS));
      setToasts((current) => [...current, item].slice(-3));

      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== item.id));
        timers.current.delete(item.id);
      }, TOAST_DURATION_MS);
      timers.current.set(item.id, timer);

      return item;
    },
    [enabled]
  );

  const markAllRead = useCallback(() => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.read ? notification : { ...notification, read: true }
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setToasts([]);
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const setEnabled = useCallback((value) => {
    setEnabledState(value);
    try {
      window.localStorage.setItem(ENABLED_KEY, String(value));
    } catch {
    }
    if (!value) {
      setToasts([]);
    }
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    []
  );

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      notifications,
      toasts,
      notify,
      dismissToast,
      markAllRead,
      clearAll,
      unreadCount: notifications.filter((item) => !item.read).length,
    }),
    [
      enabled,
      setEnabled,
      notifications,
      toasts,
      notify,
      dismissToast,
      markAllRead,
      clearAll,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationProvider.");
  }
  return context;
}
