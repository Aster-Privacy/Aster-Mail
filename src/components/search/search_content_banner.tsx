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
import { Switch } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  SearchIndexBadge,
  use_download_eta,
} from "@/components/search/search_indexing_notice";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  pause_index_download,
  resume_index_download,
  use_index_download_state,
  use_indexing_progress,
} from "@/hooks/use_search";
import {
  advance_counts,
  progress_percent,
} from "@/hooks/use_search/progress_math";

interface SearchContentBannerProps {
  enabled: boolean;
  on_enable: () => void;
  on_disable: () => void;
}

const INDEXING_ROW_LINGER_MS = 900;

export function SearchContentBanner({
  enabled,
  on_enable,
  on_disable,
}: SearchContentBannerProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const progress = use_indexing_progress();
  const download = use_index_download_state();
  const [enabling, set_enabling] = useState(false);

  useEffect(() => {
    if (enabled) set_enabling(false);
  }, [enabled]);

  const is_paused = download.paused;
  const is_downloading = progress.building && !is_paused;
  const indexing_active = is_downloading || is_paused;
  const reported_done = is_paused ? download.done : progress.current;
  const reported_total = is_paused ? download.total : progress.total;
  const session = progress.session ?? 0;
  const [counts, set_counts] = useState({ done: 0, total: 0, session: 0 });

  useEffect(() => {
    if (!indexing_active) {
      set_counts((prev) => {
        const finished =
          prev.session === session &&
          prev.total > 0 &&
          reported_total > 0 &&
          reported_done >= reported_total;

        if (!finished) return prev;

        if (prev.done === reported_total && prev.total === reported_total) {
          return prev;
        }

        return { done: reported_total, total: reported_total, session };
      });

      const timer = setTimeout(
        () => set_counts((prev) => ({ ...prev, done: 0, total: 0 })),
        INDEXING_ROW_LINGER_MS,
      );

      return () => clearTimeout(timer);
    }

    if (reported_done <= 0 && reported_total <= 0) return;

    set_counts((prev) => {
      const reported = { done: reported_done, total: reported_total };

      if (prev.session !== session) {
        return { ...advance_counts({ done: 0, total: 0 }, reported), session };
      }

      const next = advance_counts(prev, reported);

      if (next.done === prev.done && next.total === prev.total) return prev;

      return { ...next, session };
    });
  }, [indexing_active, reported_done, reported_total, session]);

  const has_total = counts.total > 0;
  const total = counts.total;
  const done = has_total ? Math.min(counts.done, total) : counts.done;
  const show_bar = has_total || done > 0;
  const can_pause = is_downloading && show_bar;
  const pct = progress_percent({ done, total }, indexing_active);
  const eta_seconds = use_download_eta(
    done,
    total,
    is_downloading && has_total && done < total,
  );

  const handle_pause = () => {
    pause_index_download();
  };

  const handle_resume = () => {
    resume_index_download(user?.email || "", true);
  };

  const help_button = (
    <InfoPopover
      description={t("mail.search_message_content_help_body")}
      icon_class="w-[15px] h-[15px]"
      title={t("mail.search_message_content_help")}
    />
  );

  if (enabled) {
    return (
      <div className="search_divider_b flex h-11 items-center gap-2 ps-4 pe-3">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-txt-primary">
            {t("mail.searching_message_content")}
          </span>
          {help_button}
        </span>
        {indexing_active || show_bar ? (
          <SearchIndexBadge
            done={done}
            eta_seconds={eta_seconds}
            is_paused={is_paused}
            on_pause={can_pause ? handle_pause : undefined}
            on_resume={handle_resume}
            percent={pct}
            testid="search-content-index"
            total={total}
          />
        ) : null}
        <Switch
          checked
          aria-label={t("mail.search_message_content")}
          size="sm"
          onCheckedChange={on_disable}
        />
      </div>
    );
  }

  return (
    <div className="search_divider_b flex h-11 items-center gap-2 ps-4 pe-3">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-[13px] font-medium text-txt-primary">
          {t("mail.search_message_content")}
        </span>
        {help_button}
      </span>
      {enabling && <Spinner size="xs" />}
      <Switch
        aria-label={t("mail.search_message_content")}
        checked={false}
        disabled={enabling}
        size="sm"
        onCheckedChange={() => {
          set_enabling(true);
          on_enable();
        }}
      />
    </div>
  );
}
