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

import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";

export type BimiAlertTone = "warning" | "error" | "success";

const TONE_STYLES: Record<BimiAlertTone, string> = {
  warning:
    "linear-gradient(to bottom, #d97706, #b45309, #92400e) padding-box, linear-gradient(to bottom, #f59e0b, #b45309, #78350f) border-box",
  error:
    "linear-gradient(to bottom, #ef4444, #dc2626, #b91c1c) padding-box, linear-gradient(to bottom, #f87171, #dc2626, #991b1b) border-box",
  success:
    "linear-gradient(to bottom, #16a34a, #15803d, #166534) padding-box, linear-gradient(to bottom, #22c55e, #15803d, #14532d) border-box",
};

const TONE_ICONS = {
  warning: ExclamationTriangleIcon,
  error: ExclamationCircleIcon,
  success: CheckCircleIcon,
};

interface BimiAlertProps {
  tone: BimiAlertTone;
  title?: string;
  items?: string[];
  children?: ReactNode;
}

export function BimiAlert({ tone, title, items, children }: BimiAlertProps) {
  const Icon = TONE_ICONS[tone];

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-white"
      role={tone === "error" ? "alert" : "status"}
      style={{ background: TONE_STYLES[tone] }}
    >
      <Icon aria-hidden="true" className="mt-px w-4 h-4 flex-shrink-0" />
      <div className="min-w-0 text-[13px] leading-5">
        {title && <p className="font-medium">{title}</p>}
        {children}
        {items && items.length > 0 && (
          <ul className={`space-y-0.5 ${title ? "mt-1" : ""}`}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
