//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { SenderVerificationStatus } from "@/types/email";

import {
  LockClosedIcon,
  LockOpenIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";

interface SenderVerificationBadgeProps {
  status?: SenderVerificationStatus;
  size?: "sm" | "md";
  className?: string;
}

export function SenderVerificationBadge({
  status,
  size = "sm",
  className = "",
}: SenderVerificationBadgeProps) {
  const { t } = use_i18n();

  if (!status || status === "unknown") return null;

  const dimension = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (status === "verified") {
    return (
      <span
        className={`inline-flex items-center flex-shrink-0 text-emerald-500 ${className}`}
        title={t("mail.verification_verified")}
      >
        <LockClosedIcon className={dimension} />
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span
        className={`inline-flex items-center flex-shrink-0 text-red-500 ${className}`}
        title={t("mail.verification_invalid")}
      >
        <ShieldExclamationIcon className={dimension} />
      </span>
    );
  }

  if (status === "no_keys") {
    return (
      <span
        className={`inline-flex items-center flex-shrink-0 text-amber-500 ${className}`}
        title={t("mail.verification_no_keys")}
      >
        <LockOpenIcon className={dimension} />
      </span>
    );
  }

  return null;
}
