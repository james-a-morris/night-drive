import type {
  DialogHTMLAttributes,
  ReactNode,
  MouseEvent,
  PointerEvent,
} from "react";
import { useLayoutEffect, useRef } from "react";

export default function Dialog({
  open,
  onClose,
  busy = false,
  children,
  ...props
}: Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose"> & {
  open: boolean;
  onClose(): void;
  busy?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null),
    backdropPressed = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    return () => {
      if (element.open) element.close();
    };
  }, [open]);
  const backdrop = (
    event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>,
  ) => {
    if (event.target !== dialog.current) return false;
    const bounds = dialog.current!.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  };
  return (
    <dialog
      {...props}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => {
        backdropPressed.current = backdrop(event);
      }}
      onClick={(event) => {
        if (backdropPressed.current && backdrop(event) && !busy) onClose();
        backdropPressed.current = false;
      }}
    >
      {children}
    </dialog>
  );
}
