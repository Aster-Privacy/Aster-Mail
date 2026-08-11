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
import { useCallback, useEffect, useRef, useState } from "react";

import { use_i18n } from "@/lib/i18n/context";
import {
  run_rethread_migration,
  type RethreadProgress,
  type RethreadResult,
} from "@/services/threading/rethread_migration";

export function RebuildConversationsSetting() {
  const { t } = use_i18n();
  const [running, set_running] = useState(false);
  const [progress, set_progress] = useState<RethreadProgress | null>(null);
  const [result, set_result] = useState<RethreadResult | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (running) return;

    set_running(true);
    set_result(null);
    set_progress(null);

    const outcome = await run_rethread_migration({
      on_progress: (next) => {
        if (mounted.current) set_progress(next);
      },
    });

    if (!mounted.current) return;

    set_running(false);
    set_progress(null);
    set_result(outcome);
  }, [running]);

  const status = (): string | null => {
    if (running) {
      if (!progress) return t("settings.rebuild_conversations_running");

      return t("settings.rebuild_conversations_progress", {
        checked: progress.threads_examined,
        split: progress.threads_split,
      });
    }

    if (!result) return null;

    if (result.outcome === "locked") {
      return t("settings.rebuild_conversations_locked");
    }

    if (result.outcome !== "completed") {
      return t("settings.rebuild_conversations_failed");
    }

    if (result.items_moved === 0) {
      return t("settings.rebuild_conversations_none");
    }

    return t("settings.rebuild_conversations_done", {
      split: result.threads_split,
      moved: result.items_moved,
    });
  };

  const message = status();

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary">
          {t("settings.rebuild_conversations")}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">
          {t("settings.rebuild_conversations_description")}
        </p>
        {message ? (
          <p className="text-sm mt-1.5 text-txt-muted">{message}</p>
        ) : null}
      </div>
      <button
        className="aster_btn aster_btn_outline aster_btn_sm shrink-0 disabled:opacity-50"
        disabled={running}
        onClick={start}
        type="button"
      >
        {running
          ? t("settings.rebuild_conversations_running")
          : t("settings.rebuild_conversations_action")}
      </button>
    </div>
  );
}
