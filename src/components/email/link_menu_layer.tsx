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
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
  LinkIcon,
  MagnifyingGlassPlusIcon,
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
import {
  copy_viewer_image,
  save_viewer_image,
} from "@/lib/email_image_actions";
import {
  LINK_MENU_EVENT,
  link_menu_host,
  type LinkMenuDetail,
} from "@/lib/link_menu_event";

interface LinkMenuState extends LinkMenuDetail {
  host: string | null;
}

export function LinkMenuLayer() {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [menu, set_menu] = useState<LinkMenuState | null>(null);

  useEffect(() => {
    const handle_open = (e: Event) => {
      const detail = (e as CustomEvent<LinkMenuDetail>).detail;

      if (!detail) return;

      const host = detail.url ? link_menu_host(detail.url) : null;

      if (!host && !detail.image) return;
      set_menu({ ...detail, url: host ? detail.url : undefined, host });
    };

    window.addEventListener(LINK_MENU_EVENT, handle_open);

    return () => window.removeEventListener(LINK_MENU_EVENT, handle_open);
  }, []);

  const handle_copy = async () => {
    if (!menu?.url) return;
    const copied = await copy_text(menu.url);

    show_toast(
      copied ? t("common.link_copied") : t("common.failed_to_copy"),
      copied ? "success" : "error",
    );
  };

  const handle_copy_image = async (src: string) => {
    try {
      await copy_viewer_image(src);
      show_toast(t("mail.image_copied"), "success");
    } catch {
      show_toast(t("mail.image_copy_failed"), "error");
    }
  };

  const handle_save_image = async (src: string) => {
    try {
      await save_viewer_image(src);
    } catch {
      show_toast(t("mail.image_save_failed"), "error");
    }
  };

  const image = menu?.image;
  const url = menu?.url;

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
        data-testid={image ? "image_menu" : "link_menu"}
        side="bottom"
      >
        {image && (
          <DropdownMenuItem
            data-testid="image_menu_view"
            onSelect={() => image.on_view()}
          >
            <MagnifyingGlassPlusIcon className="me-2 h-4 w-4" />
            {t("mail.image_menu_view")}
          </DropdownMenuItem>
        )}
        {url && !image && menu && (
          <>
            <div className="px-2 pb-2 pt-1.5" data-testid="link_menu_preview">
              <p className="truncate text-sm font-medium text-txt-primary">
                {menu.host}
              </p>
              <p className="mt-0.5 line-clamp-4 break-all text-xs text-txt-muted">
                {url}
              </p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {url && (
          <DropdownMenuItem
            data-testid="link_menu_open"
            onSelect={() => handle_external_link(url)}
          >
            <ArrowTopRightOnSquareIcon className="me-2 h-4 w-4" />
            {t("mail.link_menu_open")}
          </DropdownMenuItem>
        )}
        {url && (
          <DropdownMenuItem data-testid="link_menu_copy" onSelect={handle_copy}>
            <LinkIcon className="me-2 h-4 w-4" />
            {image ? t("mail.image_menu_copy_link") : t("mail.link_menu_copy")}
          </DropdownMenuItem>
        )}
        {image && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="image_menu_copy"
              onSelect={() => void handle_copy_image(image.src)}
            >
              <DocumentDuplicateIcon className="me-2 h-4 w-4" />
              {t("mail.image_menu_copy")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="image_menu_save"
              onSelect={() => void handle_save_image(image.src)}
            >
              <ArrowDownTrayIcon className="me-2 h-4 w-4" />
              {t("mail.image_menu_save")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
