import { apiClient } from "../lib/apiClient";
import { findModuleByKey } from "../lib/modules";

export async function getModuleStatus(moduleKey) {
  const module = findModuleByKey(moduleKey);
  if (!module) throw new Error(`Unknown module: ${moduleKey}`);
  const { data } = await apiClient.get(module.endpoint);
  return data;
}

export async function getSimulationAdminStatus() {
  const { data } = await apiClient.get("/simulation/admin/status");
  return data;
}
