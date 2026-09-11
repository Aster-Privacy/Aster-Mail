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

import { ChevronDownIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface ExtractionCardProps {
  leading: ReactNode;
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  is_collapsed: boolean;
  toggle_label: string;
  on_toggle: () => void;
  test_id: string;
  className?: string;
  children: ReactNode;
}

export function ExtractionCard({
  leading,
  title,
  subtitle,
  trailing,
  is_collapsed,
  toggle_label,
  on_toggle,
  test_id,
  className,
  children,
}: ExtractionCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-edge-primary bg-surf-secondary overflow-hidden",
        className,
      )}
      data-testid={test_id}
    >
      <button
        aria-expanded={!is_collapsed}
        aria-label={toggle_label}
        className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-surf-hover transition-colors"
        type="button"
        onClick={on_toggle}
      >
        <span className="shrink-0 flex items-center justify-center">
          {leading}
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-sm font-semibold text-txt-primary truncate">
            {title}
          </span>
          {subtitle && (
            <span className="text-xs text-txt-muted truncate">{subtitle}</span>
          )}
        </span>
        {trailing && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-txt-primary">
            {trailing}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "w-4 h-4 shrink-0 text-txt-muted transition-transform",
            !is_collapsed && "rotate-180",
          )}
        />
      </button>
      {!is_collapsed && (
        <div className="border-t border-edge-secondary">{children}</div>
      )}
    </section>
  );
}

interface ExtractionCardIconProps {
  icon: IconComponent;
}

export function ExtractionCardIcon({ icon: Icon }: ExtractionCardIconProps) {
  return (
    <span className="w-9 h-9 rounded-full bg-surf-tertiary flex items-center justify-center">
      <Icon
        aria-hidden="true"
        className="w-5 h-5 text-txt-secondary"
        strokeWidth={1.75}
      />
    </span>
  );
}

interface ExtractionCardRowProps {
  icon: IconComponent;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  test_id?: string;
}

export function ExtractionCardRow({
  icon: Icon,
  primary,
  secondary,
  trailing,
  test_id,
}: ExtractionCardRowProps) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-2 text-sm"
      data-testid={test_id}
    >
      <Icon
        aria-hidden="true"
        className="w-4 h-4 mt-0.5 shrink-0 text-txt-muted"
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <div className="text-txt-primary break-words">{primary}</div>
        {secondary && (
          <div className="text-xs text-txt-muted mt-0.5">{secondary}</div>
        )}
      </div>
      {trailing && (
        <span className="shrink-0 tabular-nums text-txt-secondary">
          {trailing}
        </span>
      )}
    </div>
  );
}

interface ExtractionCardActionsProps {
  children: ReactNode;
}

export function ExtractionCardActions({ children }: ExtractionCardActionsProps) {
  return (
    <div className="mt-1 px-2 py-1.5 border-t border-edge-secondary flex flex-wrap items-center gap-1">
      {children}
    </div>
  );
}

interface ExtractionCardActionProps {
  label: string;
  icon?: IconComponent;
  test_id?: string;
  on_click: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ExtractionCardAction({
  label,
  icon: Icon,
  test_id,
  on_click,
}: ExtractionCardActionProps) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
      data-testid={test_id}
      type="button"
      onClick={on_click}
    >
      {Icon && <Icon aria-hidden="true" className="w-4 h-4" strokeWidth={2} />}
      {label}
    </button>
  );
}
