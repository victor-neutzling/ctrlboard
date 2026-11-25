import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { useButtonFeedback } from "../hooks/useButtonFeedback";

type Props = {
  anchor: HTMLElement;
  title: string;
  theme: "light" | "dark" | "contrast";
  visualStyle: "glossy" | "flat";
  accent: string;
  onClose: () => void;
  children: ReactNode;
};

export function ControlPopover({ anchor, title, theme, visualStyle, accent, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const feedback = useButtonFeedback();

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(340, window.innerWidth - 24);
    const panelHeight = panel.current?.offsetHeight ?? 220;
    const left = Math.max(12, Math.min(
      rect.left + rect.width / 2 - panelWidth / 2,
      window.innerWidth - panelWidth - 12,
    ));
    const below = rect.bottom + 10;
    const top = below + panelHeight < window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - panelHeight - 10);
    setPosition({ left, top, width: panelWidth, visibility: "visible" });
  }, [anchor]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className={`control-popover-layer controls-screen theme-${theme} style-${visualStyle}`}
      style={{ "--accent": accent } as CSSProperties}
      aria-live="polite"
      onPointerDownCapture={feedback.onPointerDownCapture}
      onKeyDownCapture={feedback.onKeyDownCapture}
      onClickCapture={feedback.onClickCapture}
    >
      <section
        ref={panel}
        className="control-popover settings-panel"
        style={position}
        role="dialog"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
      </section>
    </div>,
    document.body,
  );
}
