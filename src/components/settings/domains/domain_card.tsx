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
import {
  TrashIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Switch } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  get_dns_records,
  get_status_color,
  get_status_label,
  type CustomDomain,
  type DnsRecord,
  type DnsRecordsResponse,
} from "@/services/api/domains";

interface DnsRecordItemProps {
  record: DnsRecord;
}

function DnsRecordItem({ record }: DnsRecordItemProps) {
  const { t } = use_i18n();
  const copy_value = async () => {
    try {
      await navigator.clipboard.writeText(record.value);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch {}
  };

  return (
    <div className="p-3 rounded-lg bg-surf-secondary border border-edge-secondary">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surf-tertiary text-txt-secondary">
            {record.record_type}
          </span>
          {record.priority && (
            <span className="text-xs text-txt-muted">
              {t("common.priority")}: {record.priority}
            </span>
          )}
          <span className="text-xs capitalize text-txt-muted">
            ({record.purpose})
          </span>
        </div>
        {record.is_verified ? (
          <CheckCircleIcon className="w-4 h-4 text-green-500" />
        ) : (
          <XMarkIcon className="w-4 h-4 text-yellow-500" />
        )}
      </div>
      <div className="mb-1">
        <p className="text-xs mb-0.5 text-txt-muted">{t("common.host")}</p>
        <p className="text-sm font-mono break-all text-txt-primary">
          {record.host}
        </p>
      </div>
      <div>
        <p className="text-xs mb-0.5 text-txt-muted">{t("common.value")}</p>
        <div className="flex items-start gap-2">
          <p className="text-sm font-mono break-all flex-1 text-txt-primary">
            {record.value}
          </p>
          <Button
            className="h-6 w-6 flex-shrink-0"
            size="icon"
            title={t("common.copy_value")}
            variant="ghost"
            onClick={copy_value}
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DomainCardProps {
  domain: CustomDomain;
  on_verify: (id: string) => void;
  on_delete: (id: string) => void;
  on_setup: (domain: CustomDomain) => void;
  on_toggle_catch_all: (id: string, enabled: boolean) => void;
  verifying: boolean;
  deleting: boolean;
}

export function DomainCard({
  domain,
  on_verify,
  on_delete,
  on_setup,
  on_toggle_catch_all,
  verifying,
  deleting,
}: DomainCardProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const [expanded, set_expanded] = useState(false);
  const [dns_records, set_dns_records] = useState<DnsRecord[]>([]);
  const [loading_records, set_loading_records] = useState(false);
  const [is_toggling, set_is_toggling] = useState(false);

  const load_dns_records = async () => {
    if (dns_records.length > 0) return;

    set_loading_records(true);
    try {
      const response = await get_dns_records(domain.id);

      if (response.data) {
        set_dns_records((response.data as DnsRecordsResponse).records);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_loading_records(false);
    }
  };

  const handle_expand = () => {
    const new_expanded = !expanded;

    set_expanded(new_expanded);
    if (new_expanded) {
      load_dns_records();
    }
  };

  const handle_catch_all_toggle = async (checked: boolean) => {
    set_is_toggling(true);
    await on_toggle_catch_all(domain.id, checked);
    set_is_toggling(false);
  };

  const verification_count = [
    domain.txt_verified,
    domain.mx_verified,
    domain.spf_verified,
    domain.dkim_verified,
    domain.dmarc_configured,
  ].filter(Boolean).length;

  return (
    <div className="rounded-lg overflow-hidden bg-surf-tertiary border border-edge-secondary">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            className="h-6 w-6 flex-shrink-0"
            size="icon"
            variant="ghost"
            onClick={handle_expand}
          >
            {expanded ? (
              <ChevronDownIcon className="w-4 h-4 text-txt-muted" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-txt-muted" />
            )}
          </Button>

          <GlobeAltIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />

          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-txt-primary">
              {domain.domain_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${get_status_color(domain.status)}`}
              >
                {get_status_label(domain.status)}
              </span>
              {domain.status !== "active" && (
                <span className="text-xs text-txt-muted">
                  {t("settings.verified_count", { count: verification_count })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {domain.status !== "active" && (
            <Button size="md" variant="depth" onClick={() => on_setup(domain)}>
              {t("settings.continue_setup")}
            </Button>
          )}

          {domain.status !== "active" && (
            <Button
              disabled={verifying}
              size="md"
              variant="ghost"
              onClick={() => on_verify(domain.id)}
            >
              {verifying ? (
                <Spinner size="xs" />
              ) : (
                <ArrowPathIcon className="w-3.5 h-3.5" />
              )}
              {t("common.verify")}
            </Button>
          )}

          <Button
            className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
            disabled={deleting}
            size="icon"
            variant="ghost"
            onClick={() => on_delete(domain.id)}
          >
            {deleting ? (
              <Spinner size="md" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-edge-secondary">
          {domain.status === "active" &&
            (is_feature_locked("has_catch_all") ? (
              <div className="mb-4">
                <UpgradeGate
                  description={t("settings.catch_all_locked")}
                  feature_name={t("settings.catch_all_label")}
                  is_locked={true}
                  min_plan="Star"
                >
                  <div />
                </UpgradeGate>
              </div>
            ) : (
              <div className="flex items-center justify-between py-4">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium text-txt-primary">
                    {t("settings.catch_all_label")}
                  </p>
                  <p className="text-sm mt-0.5 text-txt-muted">
                    {t("settings.catch_all_description")}
                  </p>
                </div>
                <Switch
                  checked={domain.catch_all_enabled}
                  onCheckedChange={handle_catch_all_toggle}
                />
              </div>
            ))}

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              {domain.txt_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-xs text-txt-secondary">TXT</span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.mx_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-xs text-txt-secondary">MX</span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.spf_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-xs text-txt-secondary">SPF</span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.dkim_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-xs text-txt-secondary">DKIM</span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.dmarc_configured ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-xs text-txt-secondary">DMARC</span>
            </div>
          </div>

          {loading_records ? (
            <div />
          ) : dns_records.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm mb-2 text-txt-tertiary">
                {t("settings.dns_records_for_domain")}
              </p>
              {dns_records.map((record, index) => (
                <DnsRecordItem key={index} record={record} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
