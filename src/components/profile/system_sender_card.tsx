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
import type { SenderProfileAvatarRenderer } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { SenderAddressCopyRow } from "@/components/profile/sender_address_copy_row";
import { SenderCardHeader } from "@/components/profile/sender_profile_card";
import { use_i18n } from "@/lib/i18n/context";

interface SystemSenderCardProps {
  email: string;
  display_name: string;
  is_open: boolean;
  on_open_change: (open: boolean) => void;
  on_copy_email: () => Promise<boolean>;
  render_avatar: SenderProfileAvatarRenderer;
  trigger_className?: string;
  children: ReactNode;
}

export function SystemSenderCard({
  email,
  display_name,
  is_open,
  on_open_change,
  on_copy_email,
  render_avatar,
  trigger_className,
  children,
}: SystemSenderCardProps) {
  const { t } = use_i18n();
  const badge_label = t("mail.official_sender");

  return (
    <DropdownMenu open={is_open} onOpenChange={on_open_change}>
      <DropdownMenuTrigger asChild>
        <button
          className={`outline-none${trigger_className ? ` ${trigger_className}` : ""}`}
          type="button"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 p-0 overflow-hidden"
        data-testid="system_sender_card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-edge-secondary">
          <SenderCardHeader
            display_name={display_name}
            email={email}
            name_badge={
              <img
                alt={badge_label}
                className="block h-4 w-4 flex-shrink-0"
                data-testid="system_sender_badge"
                draggable={false}
                src="/official_badge.webp"
                title={badge_label}
              />
            }
            render_avatar={render_avatar}
          />
        </div>
        <div className="p-1">
          <SenderAddressCopyRow email={email} on_copy={on_copy_email} />
        </div>
        <p
          className="border-t border-edge-secondary px-3 py-2.5 text-[12px] leading-relaxed text-txt-muted"
          data-testid="system_sender_note"
        >
          {t("mail.system_sender_no_replies")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
