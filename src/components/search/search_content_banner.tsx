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
import { useState } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_indexing_progress } from "@/hooks/use_search";

interface SearchContentBannerProps {
  enabled: boolean;
  on_enable: () => void;
  on_disable: () => void;
}

export function SearchContentBanner({
  enabled,
  on_enable,
  on_disable,
}: SearchContentBannerProps) {
  const { t } = use_i18n();
  const progress = use_indexing_progress();
  const [show_help, set_show_help] = useState(false);

  const is_indexing = progress.building;
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  const help_button = (
    <button
      aria-label={t("mail.search_message_content_help")}
      className="text-txt-muted hover:text-fg flex-shrink-0"
      onClick={() => set_show_help((v) => !v)}
      type="button"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    </button>
  );

  const help_body = show_help && (
    <p className="mt-2 text-[11px] leading-relaxed text-txt-muted">
      {t("mail.search_message_content_help_body")}
    </p>
  );

  const progress_count = is_indexing && progress.total > 0 && (
    <span className="font-mono tabular-nums whitespace-nowrap">
      {progress.current} / {progress.total}
    </span>
  );

  const progress_bar = is_indexing && progress.total > 0 && (
    <div className="mt-2 h-1 w-full rounded-full bg-surf-secondary overflow-hidden">
      <div
        className="h-full bg-[var(--accent-blue)] transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  if (enabled) {
    return (
      <div className="px-4 py-2 border-b border-edge-secondary text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-txt-muted min-w-0">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
            </svg>
            <span className="truncate">
              {is_indexing
                ? t("mail.indexing_messages")
                : t("mail.searching_message_content")}
            </span>
            {help_button}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0 text-txt-muted">
            {progress_count}
            <button
              className="text-txt-muted hover:text-fg underline-offset-2 hover:underline"
              onClick={on_disable}
              type="button"
            >
              {t("common.disable")}
            </button>
          </div>
        </div>
        {progress_bar}
        {help_body}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-edge-secondary">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-fg">
            {t("mail.search_message_content")}
          </span>
          {help_button}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {is_indexing && (
            <span className="text-xs text-txt-muted">{progress_count}</span>
          )}
          <button
            className="px-3 py-1 text-xs font-medium rounded-[14px] border border-edge-primary text-fg hover:bg-surf-hover transition-colors"
            onClick={on_enable}
            type="button"
          >
            {t("common.enable")}
          </button>
        </div>
      </div>
      {progress_bar}
      {help_body}
    </div>
  );
}
