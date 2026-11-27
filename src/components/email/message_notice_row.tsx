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
import type { BlockedItem } from "@/lib/html_sanitizer";

import { Fragment } from "react";

import { use_i18n } from "@/lib/i18n/context";

export type ExternalContentAction =
  { kind: "load"; types: BlockedItem["type"][] } | { kind: "settings" };

const VISIBLE_CONTENT_TYPES: readonly BlockedItem["type"][] = [
  "image",
  "font",
  "css",
];

export function external_content_action(
  blocked_items: readonly BlockedItem[] | undefined,
  image_grant_allowed: boolean,
): ExternalContentAction | null {
  if (!blocked_items || blocked_items.length === 0) return null;

  const present = new Set(blocked_items.map((item) => item.type));
  const visible = VISIBLE_CONTENT_TYPES.filter((type) => present.has(type));

  if (visible.length === 0) return null;
  if (image_grant_allowed) return { kind: "load", types: visible };

  if (present.has("image")) return { kind: "settings" };

  return { kind: "load", types: visible };
}

export function blocked_tracker_count(
  blocked_items: readonly BlockedItem[] | undefined,
): number {
  if (!blocked_items) return 0;

  return new Set(
    blocked_items
      .filter((item) => item.type === "tracking_pixel")
      .map((item) => item.url),
  ).size;
}

export type UnsubscribeNoticeState = "idle" | "loading" | "manual";

interface MessageNoticeRowProps {
  external_action: ExternalContentAction | null;
  tracker_count?: number;
  on_load_external_content: (types: BlockedItem["type"][]) => void;
  on_open_image_settings: () => void;
  unsubscribe_state: UnsubscribeNoticeState | null;
  on_unsubscribe: () => void;
  on_open_unsubscribe_page: () => void;
}

const LINK_CLASS =
  "rounded-[var(--aster-radius-control)] font-medium text-brand underline-offset-2 transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-default disabled:opacity-60 disabled:no-underline";

export function MessageNoticeRow({
  external_action,
  tracker_count = 0,
  on_load_external_content,
  on_open_image_settings,
  unsubscribe_state,
  on_unsubscribe,
  on_open_unsubscribe_page,
}: MessageNoticeRowProps): React.ReactElement | null {
  const { t } = use_i18n();

  if (!external_action && !unsubscribe_state && tracker_count <= 0) return null;

  const external_parts: React.ReactNode[] = [];

  if (external_action) {
    external_parts.push(
      <span key="text" className="text-txt-muted">
        {t("mail.external_content_hidden")}
      </span>,
    );
    external_parts.push(
      external_action.kind === "load" ? (
        <button
          key="load"
          aria-label={t("mail.load_external_content")}
          className={LINK_CLASS}
          data-testid="load-external-content"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            on_load_external_content(external_action.types);
          }}
        >
          {t("mail.show_external_content")}
        </button>
      ) : (
        <button
          key="settings"
          className={LINK_CLASS}
          data-testid="image-loading-settings"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            on_open_image_settings();
          }}
        >
          {t("mail.image_loading_settings")}
        </button>
      ),
    );
  }

  if (tracker_count > 0) {
    external_parts.push(
      <span
        key="trackers"
        className="text-txt-muted"
        data-testid="trackers-blocked"
        title={t("mail.trackers_stay_blocked")}
      >
        {t("mail.trackers_blocked_count", { count: tracker_count })}
      </span>,
    );
  }

  return (
    <div
      className="message_notice_row flex flex-wrap items-center gap-x-4 gap-y-1 ps-[68px] pe-4 pb-2 text-[13px] leading-5"
      data-testid="message-notice-row"
    >
      {external_parts.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          {external_parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="text-txt-muted">
                  ·
                </span>
              )}
              {part}
            </Fragment>
          ))}
        </div>
      )}
      {unsubscribe_state && (
        <button
          aria-busy={unsubscribe_state === "loading" || undefined}
          className={`${LINK_CLASS} ${external_parts.length > 0 ? "sm:ms-auto" : ""}`}
          data-testid="message-unsubscribe"
          disabled={unsubscribe_state === "loading"}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (unsubscribe_state === "manual") {
              on_open_unsubscribe_page();
            } else {
              on_unsubscribe();
            }
          }}
        >
          {unsubscribe_state === "manual"
            ? t("mail.open_unsubscribe_page")
            : t("mail.unsubscribe")}
        </button>
      )}
    </div>
  );
}
