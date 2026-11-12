import { Outlet } from "react-router-dom";
import { SolarVaultProvider } from "../../context/SolarVaultContext";

export default function SolarVaultLayout() {
  return (
    <SolarVaultProvider>
      <Outlet />
    </SolarVaultProvider>
  );
}
