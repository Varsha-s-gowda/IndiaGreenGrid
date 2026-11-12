import { getDashboardPath as resolveDashboardPath } from "./workspaces";

export function getDashboardPath(user) {
  return resolveDashboardPath(user);
}

export function isAdmin(user) {
  return user?.role === "ADMIN";
}
