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
import type { ReactNode } from "react";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { IslandDivider, IslandRow } from "@aster/ui";

interface BillingMoreRowProps {
  icon: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  open?: boolean;
  on_toggle?: () => void;
  on_press?: () => void;
  flush?: boolean;
  id?: string;
  children?: ReactNode;
}

export function BillingMoreRow({
  icon,
  label,
  description,
  value,
  open = false,
  on_toggle,
  on_press,
  flush = false,
  id,
  children,
}: BillingMoreRowProps) {
  const expandable = typeof on_toggle === "function";

  return (
    <div id={id}>
      <IslandRow
        aria-expanded={expandable ? open : undefined}
        description={description}
        icon={icon}
        label={label}
        on_press={expandable ? on_toggle : on_press}
        trailing={
          expandable ? (
            <ChevronDownIcon
              aria-hidden="true"
              className={`h-4 w-4 flex-shrink-0 text-txt-muted transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
              strokeWidth={2}
            />
          ) : undefined
        }
        value={value}
      />
      {expandable && open && (
        <>
          <IslandDivider inset={52} />
          <div className={flush ? "" : "px-4 pb-4 pt-3"}>{children}</div>
        </>
      )}
    </div>
  );
}

export function billing_row_icon(
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>,
) {
  return <Icon className="h-[22px] w-[22px]" />;
}
