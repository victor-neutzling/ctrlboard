import { useRef } from "react";
import type { PointerEvent } from "react";

const HOLD_DELAY_MS = 560;
const MOVE_TOLERANCE_PX = 12;

export function useLongPress<T extends HTMLElement>(onHold: (target: T) => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  const onPointerDown = (event: PointerEvent<T>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearTimer();
    held.current = false;
    event.currentTarget.removeAttribute("data-long-press-triggered");
    origin.current = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    timer.current = window.setTimeout(() => {
      held.current = true;
      target.dataset.longPressTriggered = "true";
      onHold(target);
    }, HOLD_DELAY_MS);
  };

  const onPointerMove = (event: PointerEvent<T>) => {
    const start = origin.current;
    if (!start) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      MOVE_TOLERANCE_PX
    ) {
      clearTimer();
    }
  };

  const onPointerUp = () => clearTimer();
  const onClickCapture = (event: React.MouseEvent<T>) => {
    if (!held.current) return;
    held.current = false;
    event.currentTarget.removeAttribute("data-long-press-triggered");
    event.preventDefault();
    event.stopPropagation();
  };
  const onContextMenu = (event: React.MouseEvent<T>) => event.preventDefault();

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture,
    onContextMenu,
  };
}
