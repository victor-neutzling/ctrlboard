import { useRef } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

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

function playClickSound(contextRef: { current: AudioContext | null }) {
  try {
    const context =
      contextRef.current ?? new AudioContext({ latencyHint: "interactive" });
    contextRef.current = context;
    if (context.state === "suspended") void context.resume();

    const now = context.currentTime;
    const playTone = (
      frequency: number,
      endFrequency: number,
      startAt: number,
      duration: number,
      peak: number,
      type: OscillatorType,
    ) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now + startAt);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + startAt + duration,
      );
      gain.gain.setValueAtTime(0.0001, now + startAt);
      gain.gain.exponentialRampToValueAtTime(peak, now + startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + startAt + duration,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + startAt);
      oscillator.stop(now + startAt + duration + 0.01);
    };

    playTone(620, 300, 0, 0.035, 0.4, "triangle");
    playTone(180, 90, 0.002, 0.048, 0.17, "sine");

    const clickLength = Math.ceil(context.sampleRate * 0.008);
    const clickBuffer = context.createBuffer(1, clickLength, context.sampleRate);
    const clickSamples = clickBuffer.getChannelData(0);
    for (let index = 0; index < clickLength; index += 1) {
      clickSamples[index] = (Math.random() * 2 - 1) * (1 - index / clickLength);
    }
    const click = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    click.buffer = clickBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
    click.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    click.start(now);
  } catch {
    // Audio feedback is optional; button actions must still work.
  }
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
  const audioContext = useRef<AudioContext | null>(null);

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
    if (getFeedbackButton(event.target)) playClickSound(audioContext);
  };

  return { onPointerDownCapture, onKeyDownCapture, onClickCapture };
}
