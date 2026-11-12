import { Outlet } from "react-router-dom";
import { SolarTwinProvider } from "../../context/SolarTwinContext";

export default function SimulationLayout() {
  return (
    <SolarTwinProvider>
      <Outlet />
    </SolarTwinProvider>
  );
}
