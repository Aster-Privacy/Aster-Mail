import * as React from "react";

import { cn } from "@/lib/utils";

type InputSize = "sm" | "md" | "lg" | "xl";
type InputStatus = "default" | "success" | "error";

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: "aster_input_sm",
  md: "aster_input_md",
  lg: "aster_input_lg",
  xl: "aster_input_xl",
};

const STATUS_CLASSES: Record<InputStatus, string> = {
  default: "",
  success: "aster_input_success",
  error: "aster_input_error",
};

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size"> {
  size?: InputSize;
  status?: InputStatus;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "lg", status = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "aster_input",
          SIZE_CLASSES[size],
          STATUS_CLASSES[status],
          className,
        )}
        type={type}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
