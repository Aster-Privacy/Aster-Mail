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
import { useCallback } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import type { DnsRecord } from "@/services/api/domains";

interface DnsRecordCardProps {
  record: DnsRecord;
}

export function DnsRecordCard({ record }: DnsRecordCardProps) {
  const { t } = use_i18n();

  const copy_to_clipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        show_toast(t("common.copied"), "success");
      } catch {}
    },
    [t],
  );

  return (
    <div
      className="p-3 rounded-lg bg-surf-secondary border border-edge-secondary"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-surf-tertiary text-txt-secondary">
          {record.record_type}
        </span>
        {record.priority != null && (
          <span className="text-xs text-txt-muted">
            {t("common.priority")}: {record.priority}
          </span>
        )}
      </div>

      <div className="mb-2">
        <label className="text-xs block mb-1 text-txt-muted">
          {t("common.host_name")}
        </label>
        <div
          className="flex items-center gap-2 group cursor-pointer rounded transition-colors hover:bg-surf-tertiary"
          onClick={() => copy_to_clipboard(record.host)}
        >
          <code className="flex-1 p-2 rounded text-xs font-mono break-all text-txt-primary">
            {record.host}
          </code>
          <Button
            className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              copy_to_clipboard(record.host);
            }}
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs block mb-1 text-txt-muted">
          {t("common.value")}
        </label>
        <div
          className="flex items-center gap-2 group cursor-pointer rounded transition-colors hover:bg-surf-tertiary"
          onClick={() => copy_to_clipboard(record.value)}
        >
          <code className="flex-1 p-2 rounded text-xs font-mono break-all text-txt-primary">
            {record.value}
          </code>
          <Button
            className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              copy_to_clipboard(record.value);
            }}
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
          </Button>
        </div>
      </div>
    </div>
  );
}
