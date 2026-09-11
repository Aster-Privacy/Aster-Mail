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
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { use_i18n } from "@/lib/i18n/context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface VerifiedSenderBadgeProps {
  domain?: string;
  size?: "sm" | "md";
  className?: string;
}

export function VerifiedSenderBadge({
  domain,
  size = "sm",
  className = "",
}: VerifiedSenderBadgeProps) {
  const { t } = use_i18n();

  if (!domain) return null;

  const dimension = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  const label = t("mail.verified_sender");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className={`inline-flex items-center self-center flex-shrink-0 rounded-full text-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${className}`}
          title={label}
          type="button"
          onClick={(e) => e.stopPropagation()}
        >
          <CheckBadgeIcon aria-hidden="true" className={`block ${dimension}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3 bg-surf-primary border-edge-primary"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <CheckBadgeIcon
            aria-hidden="true"
            className="h-6 w-6 flex-shrink-0 text-blue-500"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-txt-primary">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-txt-muted break-words">
              {t("mail.verified_sender_desc", { domain })}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
