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
import type { TranslationKey } from "@/lib/i18n/types";
import { show_toast } from "@/components/toast/simple_toast";
import { format_record_host, type DnsProvider } from "@/data/dns_providers";
import type { DnsRecord } from "@/services/api/domains";

import { ignore_error } from "@/lib/ignore_error";

const CAVEAT_KEYS: Record<string, TranslationKey> = {
  mx_replaces_existing: "common.dns_caveat_mx_replaces_existing",
  spf_single_record_other_senders:
    "common.dns_caveat_spf_single_record_other_senders",
  dmarc_add_after_spf_dkim: "common.dns_caveat_dmarc_add_after_spf_dkim",
};

interface DnsRecordCardProps {
  record: DnsRecord;
  domain?: string;
  provider?: DnsProvider | null;
}

export function DnsRecordCard({
  record,
  domain,
  provider,
}: DnsRecordCardProps) {
  const { t } = use_i18n();
  const caveat = record.caveat_key ? CAVEAT_KEYS[record.caveat_key] : undefined;
  const display_host = domain
    ? format_record_host(record.host, domain, provider ?? null)
    : record.host;
  const host_is_blank = display_host === "";

  const copy_to_clipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        show_toast(t("common.copied"), "success");
      } catch (caught) {
        ignore_error("components/settings/aliases/dns_record_card:DnsRecordCard", caught);
      }
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
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            record.required === false
              ? "bg-surf-tertiary text-txt-muted"
              : "bg-accent-primary/10 text-accent-primary"
          }`}
        >
          {record.required === false
            ? t("common.dns_recommended")
            : t("common.dns_required")}
        </span>
      </div>

      {caveat && <p className="text-xs mb-2 text-txt-muted">{t(caveat)}</p>}

      <div className="mb-2">
        <label className="text-xs block mb-1 text-txt-muted">
          {t("common.host_name")}
        </label>
        <div
          className="flex items-center gap-2 group cursor-pointer rounded transition-colors hover:bg-surf-tertiary"
          onClick={() => copy_to_clipboard(display_host)}
        >
          <code className="flex-1 p-2 rounded text-xs font-mono break-all text-txt-primary">
            {host_is_blank ? (
              <span className="italic text-txt-muted">
                {t("common.dns_host_leave_blank")}
              </span>
            ) : (
              display_host
            )}
          </code>
          {!host_is_blank && (
            <Button
              className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                copy_to_clipboard(display_host);
              }}
            >
              <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
            </Button>
          )}
        </div>
        {provider && display_host !== record.host && (
          <p className="text-[11px] mt-1 text-txt-muted">
            {t("common.dns_host_provider_hint", { provider: provider.name })}
          </p>
        )}
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
