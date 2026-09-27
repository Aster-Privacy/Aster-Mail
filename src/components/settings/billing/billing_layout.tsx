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

import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

type NoticeTone = "warning" | "danger" | "neutral";

const notice_tone_styles: Record<
  NoticeTone,
  { border: string; background: string; icon: string }
> = {
  warning: {
    border: "color-mix(in srgb, var(--color-warning) 40%, transparent)",
    background: "color-mix(in srgb, var(--color-warning) 8%, transparent)",
    icon: "var(--color-warning)",
  },
  danger: {
    border: "color-mix(in srgb, var(--color-danger) 40%, transparent)",
    background: "color-mix(in srgb, var(--color-danger) 7%, transparent)",
    icon: "var(--color-danger)",
  },
  neutral: {
    border: "var(--border-secondary)",
    background: "transparent",
    icon: "var(--text-muted)",
  },
};

export function BillingSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 text-sm font-medium text-txt-secondary">
      {children}
    </h3>
  );
}

export function BillingGroup({
  children,
  class_name = "",
}: {
  children: ReactNode;
  class_name?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-edge-secondary divide-y divide-edge-secondary ${class_name}`}
    >
      {children}
    </div>
  );
}

export function BillingRow({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-txt-primary">{title}</p>
          {description && (
            <div className="mt-0.5 text-xs text-txt-muted">{description}</div>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function BillingIconBox({
  icon: Icon,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge-secondary text-txt-secondary"
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function BillingNotice({
  title,
  body,
  tone = "warning",
  icon: Icon = ExclamationCircleIcon,
  role = "status",
  class_name = "",
  children,
}: {
  title: ReactNode;
  body?: ReactNode;
  tone?: NoticeTone;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  role?: "status" | "alert";
  class_name?: string;
  children?: ReactNode;
}) {
  const styles = notice_tone_styles[tone];

  return (
    <div
      className={`rounded-xl border px-4 py-4 sm:px-5 ${class_name}`}
      role={role}
      style={{ borderColor: styles.border, backgroundColor: styles.background }}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-px h-[18px] w-[18px] flex-shrink-0"
          style={{ color: styles.icon }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-txt-primary">{title}</p>
          {body && (
            <div className="mt-1 text-[13px] leading-relaxed text-txt-secondary">
              {body}
            </div>
          )}
          {children && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
