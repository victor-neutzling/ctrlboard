import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { playClickSound } from "../audioFeedback";

function showRipple(button: HTMLButtonElement, clientX: number, clientY: number) {
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

function getFeedbackButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  return (
    button instanceof HTMLButtonElement &&
    !button.disabled &&
    Boolean(button.closest(".app-card, .controls-screen"))
  )
    ? button
    : null;
}

export function useButtonFeedback() {
  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const button = getFeedbackButton(event.target);
    if (!button) return;
    showRipple(button, event.clientX, event.clientY);
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
    const button = getFeedbackButton(event.target);
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    showRipple(
      button,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (getFeedbackButton(event.target)) playClickSound();
  };

  return { onPointerDownCapture, onKeyDownCapture, onClickCapture };
}
