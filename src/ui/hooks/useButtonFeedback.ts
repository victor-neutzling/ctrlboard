import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { playClickSound } from "../audioFeedback";

function showRipple(button: HTMLElement, clientX: number, clientY: number) {
  const bounds = button.getBoundingClientRect();
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  const radius = Math.max(
    Math.hypot(x, y),
    Math.hypot(bounds.width - x, y),
    Math.hypot(x, bounds.height - y),
    Math.hypot(bounds.width - x, bounds.height - y),
  );
  const ripple = document.createElement("span");
  ripple.className = "button-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = `${radius * 2}px`;
  ripple.style.height = `${radius * 2}px`;
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  button.append(ripple);
}

function getFeedbackTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button, [role='button']");
  return (
    button instanceof HTMLElement &&
    !(button instanceof HTMLButtonElement && button.disabled) &&
    Boolean(button.closest(".app-card, .controls-screen, .compact-gauges-screen"))
  )
    ? button
    : null;
}

export function useButtonFeedback() {
  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const button = getFeedbackTarget(event.target);
    if (!button) return;
    if (button instanceof HTMLButtonElement) showRipple(button, event.clientX, event.clientY);
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
    const button = getFeedbackTarget(event.target);
    if (!button) return;
    if (button instanceof HTMLButtonElement) {
      const bounds = button.getBoundingClientRect();
      showRipple(button, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (getFeedbackTarget(event.target)) playClickSound();
  };

  return { onPointerDownCapture, onKeyDownCapture, onClickCapture };
}
