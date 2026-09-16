//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import * as React from "react";
import { Button as BaseButton, type ButtonProps } from "@aster/ui";

import { ButtonSpinner } from "@/components/ui/spinner";

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      is_loading = false,
      loading_position,
      as_child = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const has_label = React.Children.toArray(children).length > 0;
    const keep_centered =
      !has_label || props.size === "icon" || loading_position === "replace";

    if (!is_loading || as_child) {
      return (
        <BaseButton
          {...props}
          as_child={as_child}
          disabled={disabled}
          ref={ref}
        >
          {children}
        </BaseButton>
      );
    }

    return (
      <BaseButton
        {...props}
        aria-busy
        data-loading
        disabled={disabled || is_loading}
        ref={ref}
      >
        {keep_centered ? null : children}
        <ButtonSpinner
          centered={keep_centered}
          size={props.size === "sm" ? "xs" : "sm"}
        />
      </BaseButton>
    );
  },
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps };
