import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDashboardPath } from "../lib/authRoutes";
import { clearToken, getToken, getTokenExpiry, setToken } from "../lib/authStorage";
import {
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
} from "../services/authService";
import { useNotifications } from "./NotificationContext";

const AuthContext = createContext(null);
const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again to continue.";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState("");

  const { notify } = useNotifications();
  const notifyRef = useRef(notify);
  const expiryTimer = useRef(null);
  const expiredNoticeShown = useRef(false);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const expireSession = useCallback((message = SESSION_EXPIRED_MESSAGE) => {
    if (expiryTimer.current) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    clearToken();
    setUser(null);
    setAuthNotice(message);

    if (!expiredNoticeShown.current) {
      expiredNoticeShown.current = true;
      notifyRef.current({
        type: "warning",
        title: "Session expired",
        message,
        source: "Authentication",
      });
    }
  }, []);

  const scheduleExpiry = useCallback(() => {
    if (expiryTimer.current) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }

    const expiry = getTokenExpiry();
    if (!expiry) return;

    const remaining = expiry.getTime() - Date.now();
    if (remaining <= 0) {
      expireSession();
      return;
    }

    expiryTimer.current = window.setTimeout(
      () => expireSession(),
      Math.min(remaining, 2147483647)
    );
  }, [expireSession]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getToken()) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (!active) return;
        setUser(currentUser);
        expiredNoticeShown.current = false;
        scheduleExpiry();
      } catch (error) {
        if (!active) return;
        if (error?.status === 401) {
          clearToken();
          setUser(null);
        } else {
          setUser(null);
          setAuthNotice(
            "Your session could not be verified because the backend is unreachable. Start the API and reload, or sign in again."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();

    function handleSessionExpired() {
      if (active) expireSession();
    }

    window.addEventListener("solarequity:session-expired", handleSessionExpired);

    return () => {
      active = false;
      window.removeEventListener(
        "solarequity:session-expired",
        handleSessionExpired
      );
      if (expiryTimer.current) {
        window.clearTimeout(expiryTimer.current);
      }
    };
  }, [expireSession, scheduleExpiry]);

  const login = useCallback(
    async (email, password) => {
      const result = await loginRequest({ email, password });
      setToken(result.access_token);
      setUser(result.user);
      setAuthNotice("");
      expiredNoticeShown.current = false;
      scheduleExpiry();
      notifyRef.current({
        type: "success",
        title: "Signed in",
        message: `Welcome back, ${result.user.name}.`,
        source: "Authentication",
      });
      return result.user;
    },
    [scheduleExpiry]
  );

  const register = useCallback(
    async ({ name, email, password, ...profile }) => {
      await registerRequest({ name, email, password, ...profile });
      notifyRef.current({
        type: "success",
        title: "Account created",
        message: "Your India Green Grid account is ready. Signing you in now.",
        source: "Authentication",
      });
      return login(email, password);
    },
    [login]
  );

  const updateUser = useCallback((nextUser) => {
    if (nextUser) setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    if (expiryTimer.current) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    clearToken();
    setUser(null);
    setAuthNotice("");
    expiredNoticeShown.current = false;
    notifyRef.current({
      type: "info",
      title: "Signed out",
      message: "Your session has been closed.",
      source: "Authentication",
    });
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(""), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authNotice,
      clearAuthNotice,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "ADMIN",
      dashboardPath: getDashboardPath(user),
      login,
      register,
      logout,
      updateUser,
    }),
    [
      user,
      loading,
      authNotice,
      clearAuthNotice,
      login,
      register,
      logout,
      updateUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
