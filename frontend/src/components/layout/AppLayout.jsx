import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import { useHealth } from "../../context/HealthContext";
import { useReducedMotionPreference } from "../effects/usePointerCapability";
import SolarBackdrop from "../effects/SolarBackdrop";
import ConnectionBanner from "./ConnectionBanner";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const EASE_OUT = [0.22, 1, 0.36, 1];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { health } = useHealth();
  const reducedMotion = useReducedMotionPreference();
  const pageControls = useAnimationControls();

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    if (reducedMotion) {
      pageControls.set({ opacity: 1 });
      return;
    }

    pageControls.set({ opacity: 0 });
    pageControls.start({
      opacity: 1,
      transition: { duration: 0.28, ease: EASE_OUT },
    });
  }, [location.pathname, reducedMotion, pageControls]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <SolarBackdrop />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-64">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <ConnectionBanner />

        <main className="page-container flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={pageControls}
          >
            <Outlet />
          </motion.div>
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="page-container flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-slate-500 sm:px-6 lg:px-8">
            <span>India Green Grid — national clean-energy decision support</span>
            <span>
              {health
                ? `API ${health.app} v${health.version} · ${health.environment}`
                : "API status unavailable"}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
