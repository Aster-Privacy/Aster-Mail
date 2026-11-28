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
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Button } from "@aster/ui";

import { cn } from "@/lib/utils";

export type ListEmptyIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ListEmptyAction {
  label: string;
  on_click: () => void;
  icon?: ListEmptyIcon;
  primary?: boolean;
  testid?: string;
}

interface ListEmptyStateProps {
  icon: ListEmptyIcon;
  title: ReactNode;
  description?: ReactNode;
  caption?: ReactNode;
  actions?: ListEmptyAction[];
  children?: ReactNode;
  class_name?: string;
  testid?: string;
}

export function ListEmptyActions({
  actions,
}: {
  actions: ListEmptyAction[];
}): React.ReactElement | null {
  if (actions.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {actions.map(({ label, on_click, icon: Icon, primary, testid }) => (
        <Button
          key={label}
          data-testid={testid}
          size="md"
          type="button"
          variant={primary ? "depth" : "outline"}
          onClick={on_click}
        >
          {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
          {label}
        </Button>
      ))}
    </div>
  );
}

export function ListEmptyState({
  icon: Icon,
  title,
  description,
  caption,
  actions = [],
  children,
  class_name,
  testid = "list-empty-state",
}: ListEmptyStateProps): React.ReactElement {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 pb-24 pt-12 text-center",
        class_name,
      )}
      data-testid={testid}
      role="status"
    >
      <Icon
        aria-hidden="true"
        className="mb-4 h-10 w-10 shrink-0 text-txt-muted"
        strokeWidth={1.25}
      />
      <p className="max-w-[360px] break-words text-[15px] font-semibold leading-6 text-txt-primary">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-[340px] text-[13px] leading-5 text-txt-muted">
          {description}
        </p>
      )}
      {caption && (
        <p className="mt-3 max-w-full truncate text-xs text-txt-muted opacity-70">
          {caption}
        </p>
      )}
      <ListEmptyActions actions={actions} />
      {children}
    </div>
  );
}
