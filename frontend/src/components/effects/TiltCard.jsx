import { useCallback, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  usePointerCapability,
  useReducedMotionPreference,
} from "./usePointerCapability";

const EASE_OUT = [0.22, 1, 0.36, 1];

export default function TiltCard({
  children,
  className = "",
  maxTilt = 3.2,
  lift = 3,
  reveal = true,
  tilt = true,
  ...props
}) {
  const { finePointer } = usePointerCapability();
  const reducedMotion = useReducedMotionPreference();
  const canTilt = tilt && finePointer && !reducedMotion;
  const canReveal = reveal && !reducedMotion;

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const rotateX = useSpring(
    useTransform(pointerY, [0, 1], [maxTilt, -maxTilt]),
    { stiffness: 220, damping: 24, mass: 0.4 }
  );
  const rotateY = useSpring(
    useTransform(pointerX, [0, 1], [-maxTilt, maxTilt]),
    { stiffness: 220, damping: 24, mass: 0.4 }
  );
  const frameRef = useRef(0);

  const handlePointerMove = useCallback(
    (event) => {
      if (!canTilt) return;
      const node = event.currentTarget;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const nextX = (event.clientX - rect.left) / rect.width;
      const nextY = (event.clientY - rect.top) / rect.height;

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        pointerX.set(Math.min(1, Math.max(0, nextX)));
        pointerY.set(Math.min(1, Math.max(0, nextY)));
      });
    },
    [canTilt, pointerX, pointerY]
  );

  const handlePointerLeave = useCallback(() => {
    if (!canTilt) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    pointerX.set(0.5);
    pointerY.set(0.5);
  }, [canTilt, pointerX, pointerY]);

  const style = canTilt
    ? { rotateX, rotateY, transformPerspective: 900 }
    : undefined;

  if (!canReveal && !canTilt) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      initial={canReveal ? { opacity: 0, y: 14 } : false}
      whileInView={canReveal ? { opacity: 1, y: 0 } : undefined}
      viewport={canReveal ? { once: true, margin: "0px 0px -48px 0px" } : undefined}
      whileHover={canTilt ? { y: -lift } : undefined}
      transition={canReveal ? { duration: 0.45, ease: EASE_OUT } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
