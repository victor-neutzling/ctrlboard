import { useRef } from "react";
import type { Dispatch, PointerEvent, RefObject, SetStateAction } from "react";
import type { Screen } from "../types";

const screenOrder: Screen[] = ["controls", "deck", "gauges"];

type SwipeStart = {
  x: number;
  y: number;
  pointerId: number;
  baseX: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
};

function getTrackMetrics(track: HTMLDivElement | null) {
  if (!track) return { pageWidth: 0, step: 0, origin: 0 };
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const pageWidth = (track.clientWidth - gap * 2) / 3;
  return { pageWidth, step: pageWidth + gap, origin: gap * 2 };
}

export function useScreenSwipe(
  screen: Screen,
  setScreen: Dispatch<SetStateAction<Screen>>,
  trackRef: RefObject<HTMLDivElement | null>,
) {
  const swipeStart = useRef<SwipeStart | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, select, textarea, [role='switch']")) {
      swipeStart.current = null;
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const track = trackRef.current;
    const captureTarget = target?.closest("button, [role='button'], [data-long-press-target='true']") ?? event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    const pageIndex = screenOrder.indexOf(screen);
    const { step, origin } = getTrackMetrics(track);
    const baseX = origin - pageIndex * step;
    if (track) {
      track.style.transition = "none";
      track.style.transform = `translate3d(${baseX}px, 0, 0)`;
    }

    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      baseX,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    const track = trackRef.current;
    if (!start || start.pointerId !== event.pointerId || !track) return;

    const deltaX = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.lastTime);
    start.velocityX = (event.clientX - start.lastX) / elapsed;
    start.lastX = event.clientX;
    start.lastTime = event.timeStamp;

    const { step, origin } = getTrackMetrics(track);
    const proposedX = start.baseX + deltaX;
    const minX = origin - 2 * step;
    const maxX = origin;
    const settledX = Math.max(minX, Math.min(maxX, proposedX));
    const resistedX =
      proposedX === settledX
        ? settledX
        : settledX + (proposedX - settledX) * 0.24;
    track.style.transform = `translate3d(${resistedX}px, 0, 0)`;
    if (Math.abs(deltaX) > 8) event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    swipeStart.current = null;

    const track = trackRef.current;
    if (!track) return;
    const { pageWidth } = getTrackMetrics(track);
    const enoughDistance = Math.abs(dx) > pageWidth * 0.18;
    const quickFlick = Math.abs(dx) > 40 && Math.abs(start.velocityX) > 0.55;

    if ((enoughDistance || quickFlick) && Math.abs(dx) > Math.abs(dy) * 1.25) {
      event.preventDefault();
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 500);
      track.style.transition =
        "transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";

      const nextScreen =
        screen === "deck"
          ? dx < 0
            ? "gauges"
            : "controls"
          : screen === "controls" && dx < 0
            ? "deck"
            : screen === "gauges" && dx > 0
              ? "deck"
              : null;

      if (nextScreen) {
        track.dataset.screen = nextScreen;
        track.style.transform = "";
        setScreen(nextScreen);
      } else {
        track.style.transform = "";
      }
    } else {
      track.style.transition =
        "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      track.style.transform = "";
    }
  };

  const onPointerCancel = () => {
    const hadSwipe = swipeStart.current;
    swipeStart.current = null;
    const track = trackRef.current;
    if (!hadSwipe || !track) return;
    track.style.transition = "transform 220ms ease-out";
    track.style.transform = "";
  };

  const consumeSuppressedClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    consumeSuppressedClick,
  };
}
