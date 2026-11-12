import { Outlet } from "react-router-dom";
import { BillingProvider } from "../../context/BillingContext";

export default function BillingLayout() {
  return (
    <BillingProvider>
      <Outlet />
    </BillingProvider>
  );
}
