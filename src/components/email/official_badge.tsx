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
import { is_official_sender } from "@/lib/utils";

import { use_i18n } from "@/lib/i18n/context";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface OfficialBadgeProps {
  email?: string | null;
  is_external?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function OfficialBadge({
  email,
  is_external,
  size = "sm",
  className = "",
}: OfficialBadgeProps) {
  const { t } = use_i18n();

  if (is_external !== false) return null;

  if (!is_official_sender(email)) return null;

  const dimension = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  const label = t("mail.official_sender");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className={`inline-flex items-center flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${className}`}
          onClick={(e) => e.stopPropagation()}
          title={label}
          type="button"
        >
          <img
            alt={label}
            className={`inline-block ${dimension}`}
            draggable={false}
            src="/official_badge.webp"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3 bg-surf-primary border-edge-primary"
        onClick={(e) => e.stopPropagation()}
        side="bottom"
      >
        <div className="flex items-start gap-2.5">
          <img
            alt=""
            className="h-6 w-6 flex-shrink-0"
            draggable={false}
            src="/official_badge.webp"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-txt-primary">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-txt-muted">
              {t("mail.official_sender_desc")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
