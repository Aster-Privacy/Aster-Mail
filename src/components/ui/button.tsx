import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const button_variants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#4a7aff] via-[#3b6aef] to-[#2d5ae0] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:from-[#5580ff] hover:via-[#4670f5] hover:to-[#3760e5]",
        secondary:
          "bg-white dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-gray-200 dark:border-[var(--border-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]",
        destructive:
          "bg-gradient-to-b from-[#ef4444] via-[#dc2626] to-[#b91c1c] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:from-[#f05555] hover:via-[#e23737] hover:to-[#c92d2d]",
        outline:
          "border border-[var(--border-primary)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
        ghost:
          "text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[var(--text-primary)]",
        link: "text-blue-500 underline-offset-4 hover:underline hover:text-blue-600",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button_variants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(button_variants({ variant, size, className }))}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, button_variants };
