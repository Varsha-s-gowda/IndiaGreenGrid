import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  DESKTOP_CURSOR_QUERY,
  REDUCED_MOTION_QUERY,
  useMediaQuery,
} from "./usePointerCapability";

const INTERACTIVE_SELECTOR =
  "a, button, [role='button'], [data-cursor='hover'], summary, label[for]";

const TEXT_SELECTOR =
  "textarea, select, [contenteditable='true'], " +
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='color']):not([type='file'])";

const SPRING = { type: "spring", stiffness: 380, damping: 28, mass: 0.45 };
const TRAIL_SPRING = { stiffness: 150, damping: 20, mass: 0.5 };
const DOT_SPRING = { stiffness: 900, damping: 45, mass: 0.25 };

export default function CustomCursor() {
  const desktopPointer = useMediaQuery(DESKTOP_CURSOR_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const enabled = desktopPointer && !reducedMotion;

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState("default");
  const [pressed, setPressed] = useState(false);
  const modeRef = useRef("default");

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const glowX = useSpring(x, TRAIL_SPRING);
  const glowY = useSpring(y, TRAIL_SPRING);
  const dotX = useSpring(x, DOT_SPRING);
  const dotY = useSpring(y, DOT_SPRING);

  useEffect(() => {
    if (!enabled) return undefined;

    function handlePointerMove(event) {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return;
      }

      if (!document.body.classList.contains("has-custom-cursor")) {
        document.body.classList.add("has-custom-cursor");
      }

      x.set(event.clientX);
      y.set(event.clientY);
      setVisible(true);

      const target = event.target instanceof Element ? event.target : null;
      let nextMode = "default";

      if (target?.closest(TEXT_SELECTOR)) {
        nextMode = "text";
      } else if (target?.closest(INTERACTIVE_SELECTOR)) {
        nextMode = "hover";
      }

      if (nextMode !== modeRef.current) {
        modeRef.current = nextMode;
        setMode(nextMode);
      }
    }

    function hideCursor() {
      setVisible(false);
      setPressed(false);
    }

    function handlePointerDown() {
      setPressed(true);
    }

    function handlePointerUp() {
      setPressed(false);
    }

    function handleVisibilityChange() {
      if (document.hidden) hideCursor();
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    window.addEventListener("blur", hideCursor);
    document.addEventListener("mouseleave", hideCursor);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.body.classList.remove("has-custom-cursor");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", hideCursor);
      document.removeEventListener("mouseleave", hideCursor);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  const overText = mode === "text";
  const hovering = mode === "hover";

  const glowScale = pressed ? 0.82 : hovering ? 1.45 : 1;
  const dotScale = pressed ? 1.35 : hovering ? 0.55 : 1;
  const opacity = visible && !overText ? 1 : 0;

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[9998] will-change-transform"
        style={{ x: glowX, y: glowY }}
      >
        <div style={{ transform: "translate(-50%, -50%)" }}>
          <motion.span
            className="cursor-glow block h-9 w-9 rounded-full"
            animate={{ scale: glowScale, opacity: opacity * 0.9 }}
            transition={SPRING}
          />
        </div>
      </motion.div>

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[9999] will-change-transform"
        style={{ x: dotX, y: dotY }}
      >
        <div style={{ transform: "translate(-50%, -50%)" }}>
          <motion.span
            className="cursor-dot block h-1.5 w-1.5 rounded-full"
            animate={{ scale: dotScale, opacity }}
            transition={SPRING}
          />
        </div>
      </motion.div>
    </>
  );
}
