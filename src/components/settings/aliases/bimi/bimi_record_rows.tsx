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
import type { BimiRecord } from "@/services/api/bimi";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { copy_text_or_throw } from "@/utils/copy_text";

interface BimiRecordRowsProps {
  record: BimiRecord;
}

export function BimiRecordRows({ record }: BimiRecordRowsProps) {
  const { t } = use_i18n();

  const copy = async (value: string) => {
    try {
      await copy_text_or_throw(value);
      show_toast(t("common.copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy_to_clipboard"), "error");
    }
  };

  const rows = [
    { label: t("settings.bimi_record_type"), value: record.record_type },
    { label: t("settings.bimi_record_host"), value: record.host },
    { label: t("settings.bimi_record_value"), value: record.value },
  ];

  return (
    <dl className="divide-y divide-edge-secondary rounded-lg border border-edge-secondary">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
          <dt className="w-14 flex-shrink-0 text-xs text-txt-muted">
            {row.label}
          </dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-[13px] text-txt-primary">
            {row.value}
          </dd>
          <button
            aria-label={t("settings.bimi_copy_field", { field: row.label })}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-txt-muted transition-colors hover:text-txt-primary"
            type="button"
            onClick={() => copy(row.value)}
          >
            <ClipboardDocumentIcon aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      ))}
    </dl>
  );
}
