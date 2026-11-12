import { Outlet } from "react-router-dom";
import { AllocationProvider } from "../../context/AllocationContext";

export default function AllocationLayout() {
  return (
    <AllocationProvider>
      <Outlet />
    </AllocationProvider>
  );
}
