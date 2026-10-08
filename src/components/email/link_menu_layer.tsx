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
import { useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { use_external_link } from "@/contexts/external_link_context";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { copy_text } from "@/utils/copy_text";

export const LINK_MENU_EVENT = "aster-link-menu";

export interface LinkMenuDetail {
  url: string;
  x: number;
  y: number;
}

interface LinkMenuState extends LinkMenuDetail {
  host: string;
}

export function link_menu_host(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.hostname;
  } catch {
    return null;
  }
}

export function LinkMenuLayer() {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [menu, set_menu] = useState<LinkMenuState | null>(null);

  useEffect(() => {
    const handle_open = (e: Event) => {
      const detail = (e as CustomEvent<LinkMenuDetail>).detail;
      const host = detail ? link_menu_host(detail.url) : null;

      if (!detail || !host) return;
      set_menu({ ...detail, host });
    };

    window.addEventListener(LINK_MENU_EVENT, handle_open);

    return () => window.removeEventListener(LINK_MENU_EVENT, handle_open);
  }, []);

  const handle_copy = async () => {
    if (!menu) return;
    const copied = await copy_text(menu.url);

    show_toast(
      copied ? t("common.link_copied") : t("common.failed_to_copy"),
      copied ? "success" : "error",
    );
  };

  return (
    <DropdownMenu
      modal={false}
      open={menu !== null}
      onOpenChange={(open) => {
        if (!open) set_menu(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80"
        collisionPadding={8}
        data-testid="link_menu"
        side="bottom"
      >
        {menu && (
          <div className="px-2 pb-2 pt-1.5" data-testid="link_menu_preview">
            <p className="truncate text-sm font-medium text-txt-primary">
              {menu.host}
            </p>
            <p className="mt-0.5 line-clamp-4 break-all text-xs text-txt-muted">
              {menu.url}
            </p>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            if (menu) handle_external_link(menu.url);
          }}
        >
          <ArrowTopRightOnSquareIcon className="me-2 h-4 w-4" />
          {t("mail.link_menu_open")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handle_copy}>
          <LinkIcon className="me-2 h-4 w-4" />
          {t("mail.link_menu_copy")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
