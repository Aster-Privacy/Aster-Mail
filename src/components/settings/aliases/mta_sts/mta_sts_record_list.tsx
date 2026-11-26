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
import type { MtaStsRecord, MtaStsRecordStatus } from "@/services/api/mta_sts";
import type { ComponentType, SVGProps } from "react";

import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/16/solid";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";

import {
  MTA_STS_RECORD_LABELS,
  MTA_STS_RECORD_STATUS_LABELS,
} from "./mta_sts_copy";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { copy_text_or_throw } from "@/utils/copy_text";

const WARNING_TONE = "text-amber-600 dark:text-amber-400";

const STATUS_STYLES: Record<
  MtaStsRecordStatus,
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }
> = {
  ok: { Icon: CheckCircleIcon, tone: "text-green-600 dark:text-green-400" },
  missing: { Icon: ClockIcon, tone: "text-txt-muted" },
  wrong: { Icon: ExclamationTriangleIcon, tone: WARNING_TONE },
  stale: { Icon: ExclamationTriangleIcon, tone: WARNING_TONE },
  multiple: { Icon: ExclamationTriangleIcon, tone: WARNING_TONE },
};

function RecordStatusLabel({ status }: { status: MtaStsRecordStatus | null }) {
  const { t } = use_i18n();

  if (!status) return null;

  const { Icon, tone } = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}
    >
      <Icon aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
      {t(MTA_STS_RECORD_STATUS_LABELS[status])}
    </span>
  );
}

function RecordCard({ record }: { record: MtaStsRecord }) {
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
    <li
      className="rounded-lg border border-edge-secondary"
      data-testid={`mta-sts-record-${record.kind}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
        <p className="text-sm font-medium text-txt-primary">
          {t(MTA_STS_RECORD_LABELS[record.kind])}
        </p>
        {record.optional && (
          <span className="text-xs text-txt-muted">
            {t("settings.mta_sts_record_optional")}
          </span>
        )}
        <span className="ms-auto">
          <RecordStatusLabel status={record.status} />
        </span>
      </div>
      <dl className="divide-y divide-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3 py-2">
            <dt className="w-14 flex-shrink-0 text-xs text-txt-muted">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 break-all font-mono text-[13px] text-txt-primary">
              {row.value}
            </dd>
            <button
              aria-label={t("settings.bimi_copy_field", { field: row.label })}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--aster-radius-control)] text-txt-muted transition-colors hover:text-txt-primary"
              type="button"
              onClick={() => copy(row.value)}
            >
              <ClipboardDocumentIcon aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function MtaStsRecordList({ records }: { records: MtaStsRecord[] }) {
  return (
    <ul className="space-y-3">
      {records.map((record) => (
        <RecordCard key={record.kind} record={record} />
      ))}
    </ul>
  );
}
