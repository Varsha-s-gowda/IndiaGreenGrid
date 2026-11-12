import { Outlet } from "react-router-dom";
import { RoofMaxProvider } from "../../context/RoofMaxContext";

export default function RoofMaxLayout() {
  return (
    <RoofMaxProvider>
      <Outlet />
    </RoofMaxProvider>
  );
}
