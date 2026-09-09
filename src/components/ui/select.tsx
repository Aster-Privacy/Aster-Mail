import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]",
      className,
    )}
    {...props}
  />
));

SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn(
      "-mx-1.5 my-1.5 h-px bg-[var(--border-secondary)]",
      className,
    )}
    {...props}
  />
));

SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-[var(--text-muted)]",
      className,
    )}
    {...props}
  >
    <ChevronUpIcon className="h-3.5 w-3.5" />
  </SelectPrimitive.ScrollUpButton>
));

SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-[var(--text-muted)]",
      className,
    )}
    {...props}
  >
    <ChevronDownIcon className="h-3.5 w-3.5" />
  </SelectPrimitive.ScrollDownButton>
));

SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, style, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "group flex h-10 w-full items-center justify-between gap-2 overflow-hidden rounded-lg border border-[var(--border-secondary)] bg-[var(--input-bg)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] hover:border-[var(--border-primary)] active:bg-[var(--bg-secondary)] data-[state=open]:bg-[var(--bg-secondary)] data-[state=open]:border-[var(--border-primary)] data-[placeholder]:font-normal data-[placeholder]:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    style={{
      boxShadow: "var(--select-shadow)",
      ...style,
    }}
    {...props}
  >
    <span className="min-w-0 truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));

SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

function use_wheel_scroll() {
  const detach_ref = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      detach_ref.current?.();
      detach_ref.current = null;
    };
  }, []);

  return React.useCallback((node: HTMLDivElement | null) => {
    detach_ref.current?.();
    detach_ref.current = null;

    if (!node) return;

    const handle_wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (node.scrollHeight <= node.clientHeight) return;

      const line_height = 16;
      const page_height = node.clientHeight;
      const delta =
        event.deltaMode === 1
          ? event.deltaY * line_height
          : event.deltaMode === 2
            ? event.deltaY * page_height
            : event.deltaY;

      event.preventDefault();
      event.stopPropagation();
      node.scrollTop += delta;
    };

    node.addEventListener("wheel", handle_wheel, { passive: false });
    detach_ref.current = () => node.removeEventListener("wheel", handle_wheel);
  }, []);
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const viewport_ref = use_wheel_scroll();

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-[70] max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-[var(--border-secondary)] bg-[var(--dropdown-bg)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          position === "popper" && "translate-y-1",
          className,
        )}
        collisionPadding={12}
        position={position}
        sideOffset={6}
        style={{ boxShadow: "var(--dropdown-shadow)" }}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          ref={viewport_ref}
          className={cn(
            "p-1.5 max-h-[inherit] overflow-y-auto overscroll-contain",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-[36px] w-full cursor-pointer select-none items-center rounded-lg py-2 ps-3 pe-9 text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06] focus:bg-black/[0.06] dark:focus:bg-white/[0.06] data-[highlighted]:bg-black/[0.06] dark:data-[highlighted]:bg-white/[0.06] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:text-txt-primary data-[state=checked]:font-medium",
      className,
    )}
    {...props}
  >
    <span className="absolute end-2.5 flex h-4 w-4 items-center justify-center text-brand">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));

SelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
