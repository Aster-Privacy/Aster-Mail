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
import type {} from "@/lib/i18n/types";

import { ClockIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Island, IslandIconButton, IslandRow } from "@aster/ui";

import {
  format_relative_time,
  get_status_icon,
  get_status_label,
} from "./status";

import { use_i18n } from "@/lib/i18n/context";
import { type ImportJob } from "@/services/api/email_import";
import { app_locale } from "@/utils/date_format";

export function ImportJobCard({
  job,
  on_delete,
}: {
  job: ImportJob;
  on_delete: (id: string) => void;
}) {
  const { t } = use_i18n();
  const source_label = job.source.charAt(0).toUpperCase() + job.source.slice(1);
  const skipped_text =
    job.skipped_emails > 0
      ? `, ${t("settings.n_skipped", { count: job.skipped_emails })}`
      : "";
  const can_delete = job.status !== "processing" && job.status !== "pending";

  const is_failed = job.status === "failed" || job.status === "cancelled";

  return (
    <Island>
      <IslandRow
        description={
          <span className={is_failed ? "text-red-500" : undefined}>
            {job.status === "completed"
              ? t("settings.imported_skipped", {
                  imported: job.processed_emails.toLocaleString(app_locale()),
                  skipped: skipped_text,
                })
              : get_status_label(job.status, t)}
          </span>
        }
        icon={get_status_icon(job.status)}
        label={
          <span className="block truncate">
            {t("settings.source_import", { source: source_label })}
          </span>
        }
        trailing={
          <span className="flex items-center gap-1.5 text-xs text-txt-muted">
            <ClockIcon className="w-3 h-3" />
            <span className="tabular-nums">
              {format_relative_time(job.created_at, t)}
            </span>
            {can_delete && (
              <IslandIconButton
                className="ms-1"
                label={t("common.delete")}
                size="sm"
                onClick={() => on_delete(job.id)}
              >
                <TrashIcon className="w-4 h-4" />
              </IslandIconButton>
            )}
          </span>
        }
      />
    </Island>
  );
}
