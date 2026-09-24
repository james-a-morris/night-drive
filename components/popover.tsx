import type {
  ReactNode,
  KeyboardEvent,
  ButtonHTMLAttributes,
  HTMLAttributes,
  RefObject,
  RefCallback,
} from "react";
export interface PopoverState {
  open: boolean;
  close(restoreFocus?: boolean): void;
  triggerProps: ButtonHTMLAttributes<HTMLButtonElement> & {
    ref: RefObject<HTMLButtonElement | null>;
  };
  panelProps: HTMLAttributes<HTMLElement> & { ref: RefCallback<HTMLElement> };
}
import { useEffect, useRef, useState } from "react";

// Shared menu focus, dismissal and keyboard navigation; children own their markup.
export default function Popover({
  children,
  role = "menu",
}: {
  children: (state: PopoverState) => ReactNode;
  role?: "menu" | "listbox" | null;
}) {
  const trigger = useRef<HTMLButtonElement | null>(null),
    panel = useRef<HTMLElement | null>(null),
    initial = useRef<number | "selected">(0),
    search = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const items = () =>
    [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"],[role="option"]',
      ) || []),
    ].filter((item) => !item.closest("[hidden]") && !item.matches(":disabled"));
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const choices = items();
    const selected = choices.find(
      (item) =>
        item.getAttribute("aria-selected") === "true" ||
        item.getAttribute("aria-checked") === "true",
    );
    (initial.current === "selected"
      ? selected || choices[0]
      : choices.at(initial.current)
    )?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const blur = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("blur", blur);
    };
  }, [open]);
  function keydown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(true);
      return;
    }
    const choices = items();
    const index = choices.indexOf(document.activeElement as HTMLElement);
    const destinations: Record<string, number> = {
      ArrowDown: (index + 1) % choices.length,
      ArrowUp: (index - 1 + choices.length) % choices.length,
      Home: 0,
      End: choices.length - 1,
    };
    const next = destinations[event.key];
    if (next !== undefined) {
      event.preventDefault();
      choices[next]?.focus();
      return;
    }
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const group = [
        ...((event.target as HTMLElement)
          .closest('[role="group"]')
          ?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') || []),
      ];
      if (group.length) {
        event.preventDefault();
        group.at(event.key === "ArrowLeft" ? 0 : -1)?.focus();
      }
    } else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = performance.now();
      search.current = {
        text:
          (now - search.current.at < 600 ? search.current.text : "") +
          event.key.toLowerCase(),
        at: now,
      };
      choices
        .find((item) =>
          (item.getAttribute("aria-label") || item.textContent)
            .trim()
            .toLowerCase()
            .startsWith(search.current.text),
        )
        ?.focus();
    }
  }
  return children({
    open,
    close,
    triggerProps: {
      ref: trigger,
      "aria-haspopup": role ?? undefined,
      "aria-expanded": open,
      onClick: () => {
        initial.current = "selected";
        setOpen(!open);
      },
      onKeyDown: (event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          initial.current = ["ArrowUp", "End"].includes(event.key) ? -1 : 0;
          setOpen(true);
        }
      },
    },
    panelProps: {
      ref: (node) => {
        panel.current = node;
      },
      hidden: !open,
      onKeyDown: keydown,
    },
  });
}
