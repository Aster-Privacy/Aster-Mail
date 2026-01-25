"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon, MinusIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, indeterminate, checked, onCheckedChange, ...props }, ref) => {
  const handle_change = React.useCallback(
    (new_checked: CheckboxPrimitive.CheckedState) => {
      if (indeterminate) {
        onCheckedChange?.(true);
      } else {
        onCheckedChange?.(new_checked);
      }
    },
    [indeterminate, onCheckedChange],
  );

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={indeterminate ? true : checked}
      className={cn(
        "grid place-content-center peer h-[18px] w-[18px] shrink-0 rounded-[4px] border-[1.5px] border-[var(--text-muted)] bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 hover:border-[var(--text-tertiary)]",
        className,
      )}
      onCheckedChange={handle_change}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        className={cn(
          "grid place-content-center text-white h-full w-full data-[state=unchecked]:opacity-0",
        )}
      >
        {indeterminate ? (
          <MinusIcon className="h-3 w-3" />
        ) : (
          <CheckIcon className="h-3 w-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
