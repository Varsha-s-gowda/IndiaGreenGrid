import { useCallback, useEffect, useRef } from "react";

export default function useMagnetic({
  disabled = false,
  strength = 0.22,
  maxOffset = 6,
} = {}) {
  const ref = useRef(null);
  const frameRef = useRef(0);

  const reset = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    if (ref.current) ref.current.style.transform = "";
  }, []);

  const onPointerMove = useCallback(
    (event) => {
      if (disabled) return;
      if (
        event.pointerType &&
        event.pointerType !== "mouse" &&
        event.pointerType !== "pen"
      ) {
        return;
      }

      const node = ref.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const offsetX = Math.max(
        -maxOffset,
        Math.min(maxOffset, (event.clientX - rect.left - rect.width / 2) * strength)
      );
      const offsetY = Math.max(
        -maxOffset,
        Math.min(maxOffset, (event.clientY - rect.top - rect.height / 2) * strength)
      );

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        node.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
      });
    },
    [disabled, maxOffset, strength]
  );

  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  return { ref, onPointerMove, onPointerLeave: reset };
}
