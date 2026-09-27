import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const ANKI_CARD_WIDTH = 1920;
export const ANKI_CARD_HEIGHT = 1080;
const GUTTER = 16;
type Position = { x: number; y: number };

export default function useAnkiWindow() {
  const panel = useRef<HTMLDialogElement | null>(null);
  const [expanded, setExpanded] = useState(false), [dragging, setDragging] = useState(false);
  const position = useRef<Position | null>(null), compactPosition = useRef<Position | null>(null);
  const beforeExpansion = useRef<DOMRect | null>(null), animation = useRef<Animation | null>(null);
  const drag = useRef<{ pointer: number; start: Position; origin: Position } | null>(null);

  function place(next: Position | null = position.current) {
    const element = panel.current!;
    const { width, height } = element.getBoundingClientRect();
    const preferred = next ?? { x: (window.innerWidth - width) / 2, y: (window.innerHeight - height) / 2 };
    const bounded = {
      x: Math.max(GUTTER, Math.min(preferred.x, window.innerWidth - width - GUTTER)),
      y: Math.max(GUTTER, Math.min(preferred.y, window.innerHeight - height - GUTTER)),
    };
    element.style.left = `${bounded.x}px`;
    element.style.top = `${bounded.y}px`;
    if (next) position.current = bounded;
  }

  function fit() {
    const element = panel.current!;
    const screen = element.querySelector<HTMLElement>(".anki-card-viewport");
    if (screen) {
      // Reserve the actual, unscaled controls before fitting the 16:9 screen.
      // The minimum width keeps those controls usable in very short windows.
      const chrome = element.offsetHeight - screen.offsetHeight;
      const inset = element.offsetWidth - screen.offsetWidth;
      const width = Math.max(Math.min(360, window.innerWidth - GUTTER * 2),
        (window.innerHeight - GUTTER * 2 - chrome) * ANKI_CARD_WIDTH / ANKI_CARD_HEIGHT + inset);
      element.style.setProperty("--anki-fit-width", `${Math.floor(width)}px`);
    } else element.style.removeProperty("--anki-fit-width");
  }

  function settle() {
    animation.current?.cancel();
    animation.current = null;
    fit(); place();
  }

  useLayoutEffect(() => {
    fit();
    const from = beforeExpansion.current;
    beforeExpansion.current = null;
    if (!from) { place(); return; }
    const element = panel.current!;
    const { width, height } = element.getBoundingClientRect();
    position.current = expanded
      ? { x: from.x + (from.width - width) / 2, y: from.y + (from.height - height) / 2 }
      : compactPosition.current;
    place();
    const to = element.getBoundingClientRect();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = (rect: DOMRect) => ({ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const motion = element.animate([bounds(from), bounds(to)], { duration: 250, easing: "cubic-bezier(.2,.7,.2,1)" });
    animation.current = motion;
    motion.onfinish = () => {
      if (animation.current !== motion) return;
      animation.current = null;
      fit(); place();
    };
  }, [expanded]);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!animation.current && !drag.current) { fit(); place(); }
    });
    observer.observe(panel.current!);
    window.addEventListener("resize", settle);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", settle);
      animation.current?.cancel();
      animation.current = null;
    };
  }, []);

  function toggle() {
    const bounds = panel.current!.getBoundingClientRect();
    animation.current?.cancel(); animation.current = null;
    beforeExpansion.current = bounds;
    if (!expanded) compactPosition.current = position.current;
    setExpanded(value => !value);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
    settle();
    const bounds = panel.current!.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: bounds.x, y: bounds.y } };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setDragging(true);
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    place({ x: active.origin.x + event.clientX - active.start.x, y: active.origin.y + event.clientY - active.start.y });
  }
  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    settle();
    if (event.key === "Home") { position.current = null; place(); return; }
    const bounds = panel.current!.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
    place({ x: bounds.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      y: bounds.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) });
  }

  return { panel, expanded, dragging, toggle,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp, onKeyDown } };
}
