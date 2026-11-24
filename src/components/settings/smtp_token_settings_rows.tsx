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
import type { SmtpConnectionSettings } from "@/services/api/smtp_tokens";
import type { TranslationKey } from "@/lib/i18n/types";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

export interface SmtpTokenSettingsRow {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}

type Translate = (key: TranslationKey) => string;

export function build_smtp_connection_rows(
  t: Translate,
  settings: SmtpConnectionSettings,
): SmtpTokenSettingsRow[] {
  return [
    { label: t("settings.smtp_token_host"), value: settings.host },
    { label: t("settings.smtp_token_port"), value: String(settings.port) },
    { label: t("settings.smtp_token_security"), value: settings.security },
    { label: t("settings.smtp_token_username"), value: settings.username },
  ];
}

export function smtp_settings_rows_to_text(
  rows: SmtpTokenSettingsRow[],
): string {
  return rows
    .filter((row) => row.copyable !== false)
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");
}

interface SmtpTokenSettingsRowsProps {
  rows: SmtpTokenSettingsRow[];
  on_copy: (value: string) => void;
}

const ROW_LAYOUT =
  "w-full grid grid-cols-[5.5rem_minmax(0,1fr)_1.25rem] items-center gap-3 px-4 py-3 text-start";

export function SmtpTokenSettingsRows({
  rows,
  on_copy,
}: SmtpTokenSettingsRowsProps) {
  const { t } = use_i18n();

  return (
    <div className="overflow-hidden rounded-xl border border-edge-secondary bg-surf-primary divide-y divide-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]">
      {rows.map((row) =>
        row.copyable === false ? (
          <div key={row.label} className={ROW_LAYOUT}>
            <span className="text-xs font-medium text-txt-muted">
              {row.label}
            </span>
            <span className="min-w-0 text-sm text-txt-muted text-end truncate">
              {row.value}
            </span>
            <span aria-hidden="true" />
          </div>
        ) : (
          <button
            key={row.label}
            aria-label={`${t("common.copy")} ${row.label}`}
            className={`group ${ROW_LAYOUT} transition-colors hover:bg-[var(--aster-hover)] focus-visible:bg-black/[0.04] focus-visible:outline-none`}
            type="button"
            onClick={() => on_copy(row.value)}
          >
            <span className="text-xs font-medium text-txt-muted">
              {row.label}
            </span>
            <span
              className={[
                "min-w-0 text-sm text-txt-primary text-end",
                row.mono ? "font-mono break-all" : "truncate",
              ].join(" ")}
              title={row.mono ? undefined : row.value}
            >
              {row.value}
            </span>
            <ClipboardDocumentIcon className="w-4 h-4 justify-self-end text-txt-muted transition-colors group-hover:text-txt-primary" />
          </button>
        ),
      )}
    </div>
  );
}
