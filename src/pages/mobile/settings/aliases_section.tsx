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
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  AtSymbolIcon,
  LinkIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import { SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_aliases } from "@/components/settings/hooks/use_aliases";
import { CreateAliasModal } from "@/components/settings/aliases/alias_form";
import { DomainSetupWizard } from "@/components/settings/aliases_section";
import {
  get_dns_records,
  get_status_color,
  get_status_label,
  type DnsRecord,
  type DnsRecordsResponse,
} from "@/services/api/domains";

export function AliasesSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const hook = use_aliases();
  const [expanded_domain, set_expanded_domain] = useState<string | null>(null);
  const [domain_dns_records, set_domain_dns_records] = useState<
    Record<string, DnsRecord[]>
  >({});

  const handle_copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          show_toast(t("settings.copied_to_clipboard"), "success");
        })
        .catch(() => {});
    },
    [t],
  );

  const handle_expand_domain = useCallback(
    async (domain_id: string) => {
      if (expanded_domain === domain_id) {
        set_expanded_domain(null);

        return;
      }
      set_expanded_domain(domain_id);
      if (!domain_dns_records[domain_id]) {
        const response = await get_dns_records(domain_id);

        if (response.data) {
          set_domain_dns_records((prev) => ({
            ...prev,
            [domain_id]: (response.data as DnsRecordsResponse).records,
          }));
        }
      }
    },
    [expanded_domain, domain_dns_records],
  );

  const total_count = hook.alias_counts?.count ?? hook.aliases.length;
  const max_count = hook.alias_counts?.max ?? hook.max_aliases;

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.aliases_and_domains")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4">
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background:
                "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #2563eb 70%, #3b82f6 100%)",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="relative z-10">
              <h3
                className="text-[17px] font-bold text-white mb-1 tracking-tight"
                style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
              >
                {t("settings.domain_promo_title")}
              </h3>
              <p
                className="text-[13px] text-blue-100/70 mb-4"
                style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
              >
                {t("settings.domain_promo_subtitle")}
              </p>
              <button
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[14px] font-semibold bg-white text-blue-900"
                style={{
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                  WebkitTapHighlightColor: "transparent",
                }}
                type="button"
                onClick={hook.handle_open_add_domain}
              >
                {t("settings.domain_promo_cta")}
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t("settings.email_aliases")}
            </p>
            {hook.alias_counts && (
              <span className="text-[12px] text-[var(--text-muted)]">
                {total_count}/{max_count === -1 ? "∞" : max_count}
              </span>
            )}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] mb-3">
            {t("settings.aliases_description")}
          </p>
        </div>

        <div className="px-4">
          <motion.button
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
              boxShadow:
                "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            type="button"
            onClick={() => {
              const has_custom_domains = hook.domains.some(
                (d) => d.status === "active",
              );

              if (
                max_count !== -1 &&
                total_count >= max_count &&
                !has_custom_domains
              ) {
                hook.set_show_upgrade_modal(true);
              } else {
                hook.set_show_create_alias_modal(true);
              }
            }}
          >
            <PlusIcon className="h-5 w-5" />
            {t("settings.create_alias")}
          </motion.button>
        </div>

        {hook.aliases_loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : hook.aliases.length === 0 && hook.domain_addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-12">
            <AtSymbolIcon className="h-16 w-16 text-[var(--mobile-text-muted)] opacity-40" />
            <p className="text-center text-[14px] text-[var(--mobile-text-muted)]">
              {t("settings.no_aliases_yet")}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-3 space-y-2">
            {hook.aliases.map((alias) => (
              <div
                key={alias.id}
                className="rounded-xl bg-[var(--mobile-bg-card)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[15px] font-medium text-[var(--mobile-text-primary)]">
                    {alias.full_address}
                  </span>
                  <button
                    type="button"
                    onClick={() => handle_copy(alias.full_address)}
                  >
                    <ClipboardDocumentIcon className="h-4 w-4 text-[var(--mobile-text-muted)]" />
                  </button>
                </div>
                {alias.display_name && (
                  <p className="mt-1 text-[13px] text-[var(--mobile-text-muted)]">
                    {alias.display_name}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <Switch
                    checked={alias.is_enabled}
                    disabled={hook.toggling_id === alias.id}
                    onCheckedChange={(v) =>
                      hook.handle_alias_toggle(alias.id, v)
                    }
                  />
                  <span
                    className={`text-[12px] font-medium ${alias.is_enabled ? "text-[var(--color-success,#22c55e)]" : "text-[var(--mobile-text-muted)]"}`}
                  >
                    {alias.is_enabled
                      ? t("common.enabled")
                      : t("common.disable")}
                  </span>
                  <button
                    className="ml-auto text-[13px] text-[var(--mobile-danger)]"
                    disabled={hook.alias_deleting_id === alias.id}
                    type="button"
                    onClick={() => hook.handle_alias_delete(alias.id)}
                  >
                    {hook.alias_deleting_id === alias.id ? (
                      <Spinner size="xs" />
                    ) : (
                      t("common.delete")
                    )}
                  </button>
                </div>
              </div>
            ))}
            {hook.domain_addresses.map((addr) => (
              <div
                key={addr.id}
                className="rounded-xl bg-[var(--mobile-bg-card)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[15px] font-medium text-[var(--mobile-text-primary)]">
                    {addr.local_part}@{addr.domain_name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handle_copy(`${addr.local_part}@${addr.domain_name}`)
                    }
                  >
                    <ClipboardDocumentIcon className="h-4 w-4 text-[var(--mobile-text-muted)]" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="rounded bg-[var(--mobile-bg-card-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    {addr.domain_name}
                  </span>
                  <button
                    className="ml-auto text-[13px] text-[var(--mobile-danger)]"
                    disabled={hook.domain_addr_deleting_id === addr.id}
                    type="button"
                    onClick={() =>
                      hook.handle_domain_addr_delete(addr.id, addr.domain_id)
                    }
                  >
                    {hook.domain_addr_deleting_id === addr.id ? (
                      <Spinner size="xs" />
                    ) : (
                      t("common.delete")
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t("settings.custom_domains_label")}
            </p>
            {hook.max_domains !== 0 && (
              <span className="text-[12px] text-[var(--text-muted)]">
                {hook.domains.length}/
                {hook.max_domains === -1 ? "∞" : hook.max_domains}
              </span>
            )}
          </div>

          {!hook.domains_loading && hook.max_domains === 0 ? (
            <div className="rounded-2xl bg-[var(--mobile-bg-card)] p-5 text-center">
              <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">
                {t("settings.custom_domains_not_available")}
              </p>
              <p className="text-[13px] text-[var(--text-muted)] mb-3">
                {t("settings.upgrade_plan_more_domains")}
              </p>
              <motion.button
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  boxShadow:
                    "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("navigate-settings", { detail: "billing" }),
                  )
                }
              >
                {t("common.upgrade_plan")}
              </motion.button>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-[var(--text-muted)] mb-3">
                {t("settings.domains_description")}
              </p>
              <motion.button
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 mb-3 text-[15px] font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  boxShadow:
                    "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                type="button"
                onClick={hook.handle_open_add_domain}
              >
                <PlusIcon className="h-5 w-5" />
                {t("common.add_domain")}
              </motion.button>

              {hook.domains_loading ? null : hook.domains.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <LinkIcon className="h-12 w-12 text-[var(--mobile-text-muted)] opacity-40 mb-2" />
                  <p className="text-[13px] text-[var(--mobile-text-muted)]">
                    {t("settings.no_domains_yet")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {hook.domains.map((domain) => {
                    const verification_count = [
                      domain.txt_verified,
                      domain.mx_verified,
                      domain.spf_verified,
                      domain.dkim_verified,
                      domain.dmarc_configured,
                    ].filter(Boolean).length;
                    const is_expanded = expanded_domain === domain.id;

                    return (
                      <div
                        key={domain.id}
                        className="rounded-xl bg-[var(--mobile-bg-card)] overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => handle_expand_domain(domain.id)}
                          >
                            <ChevronDownIcon
                              className="h-4 w-4 text-[var(--text-muted)] transition-transform"
                              style={{
                                transform: is_expanded
                                  ? "rotate(0deg)"
                                  : "rotate(-90deg)",
                              }}
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                              {domain.domain_name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full ${get_status_color(domain.status)}`}
                              >
                                {get_status_label(domain.status)}
                              </span>
                              {domain.status !== "active" && (
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {verification_count}/5
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {domain.status !== "active" && (
                              <button
                                className="rounded-[12px] px-3 py-1.5 text-[12px] font-medium text-white"
                                style={{
                                  background:
                                    "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                                }}
                                type="button"
                                onClick={() => hook.handle_open_setup(domain)}
                              >
                                {t("settings.continue_setup")}
                              </button>
                            )}
                            <button
                              className="text-[var(--color-danger,#ef4444)] disabled:opacity-50"
                              disabled={hook.domain_deleting_id === domain.id}
                              type="button"
                              onClick={() =>
                                hook.handle_domain_delete(domain.id)
                              }
                            >
                              {hook.domain_deleting_id === domain.id ? (
                                <Spinner size="xs" />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {is_expanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-[var(--border-primary)]">
                            <div className="flex flex-wrap items-center gap-3 mb-3">
                              {(
                                [
                                  ["TXT", domain.txt_verified],
                                  ["MX", domain.mx_verified],
                                  ["SPF", domain.spf_verified],
                                  ["DKIM", domain.dkim_verified],
                                  ["DMARC", domain.dmarc_configured],
                                ] as [string, boolean][]
                              ).map(([label, verified]) => (
                                <div
                                  key={label}
                                  className="flex items-center gap-1"
                                >
                                  {verified ? (
                                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <XCircleIcon className="w-4 h-4 text-yellow-500" />
                                  )}
                                  <span className="text-[11px] text-[var(--text-secondary)]">
                                    {label}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {domain_dns_records[domain.id] &&
                              domain_dns_records[domain.id].map(
                                (record, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-lg bg-[var(--mobile-bg-card-hover)] p-3 mb-2"
                                  >
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                                        {record.record_type}
                                      </span>
                                      <span className="text-[10px] capitalize text-[var(--text-muted)]">
                                        ({record.purpose})
                                      </span>
                                      {record.is_verified ? (
                                        <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 ml-auto" />
                                      ) : (
                                        <XCircleIcon className="w-3.5 h-3.5 text-yellow-500 ml-auto" />
                                      )}
                                    </div>
                                    <div className="mb-1">
                                      <p className="text-[10px] text-[var(--text-muted)]">
                                        {t("common.host")}
                                      </p>
                                      <div className="flex items-center gap-1">
                                        <p className="text-[12px] font-mono break-all text-[var(--text-primary)] flex-1">
                                          {record.host}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handle_copy(record.host)
                                          }
                                        >
                                          <ClipboardDocumentIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                        </button>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-[var(--text-muted)]">
                                        {t("common.value")}
                                      </p>
                                      <div className="flex items-center gap-1">
                                        <p className="text-[12px] font-mono break-all text-[var(--text-primary)] flex-1">
                                          {record.value}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handle_copy(record.value)
                                          }
                                        >
                                          <ClipboardDocumentIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ),
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CreateAliasModal
        available_domains={hook.available_domains_for_aliases}
        current_count={total_count}
        custom_domains={hook.domains}
        domain_addresses={hook.domain_addresses}
        is_open={hook.show_create_alias_modal}
        max_aliases={max_count}
        on_close={() => hook.set_show_create_alias_modal(false)}
        on_created={() => {
          hook.load_aliases();
          hook.load_alias_counts();
          hook.load_domain_addresses(hook.domains);
        }}
      />

      <DomainSetupWizard
        current_count={hook.domains.length}
        dns_records={hook.wizard_dns_records}
        domain_id={hook.wizard_domain_id}
        domain_name={hook.wizard_domain_name}
        is_open={hook.wizard_open}
        max_domains={hook.max_domains}
        mode={hook.wizard_mode}
        on_close={hook.handle_wizard_close}
        on_domain_added={hook.handle_domain_added}
        on_domains_changed={hook.load_domains}
      />

      <ConfirmationModal
        confirm_text={null}
        is_open={hook.alias_too_new_info.is_open}
        message={t("settings.alias_too_new_message", {
          date: hook.alias_too_new_info.eligible_date ?? "",
        })}
        on_cancel={() =>
          hook.set_alias_too_new_info({ is_open: false, eligible_date: null })
        }
        on_confirm={() =>
          hook.set_alias_too_new_info({ is_open: false, eligible_date: null })
        }
        title={t("settings.alias_too_new_title")}
        variant="info"
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={hook.alias_delete_confirm.is_open}
        message={t("settings.delete_alias_confirmation")}
        on_cancel={() =>
          hook.set_alias_delete_confirm({ is_open: false, id: null })
        }
        on_confirm={hook.confirm_alias_delete}
        title={t("common.delete_alias")}
        variant="danger"
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={hook.domain_delete_confirm.is_open}
        message={t("settings.delete_domain_confirmation")}
        on_cancel={() =>
          hook.set_domain_delete_confirm({ is_open: false, id: null })
        }
        on_confirm={hook.confirm_domain_delete}
        title={t("common.delete_domain")}
        variant="danger"
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={hook.domain_addr_delete_confirm.is_open}
        message={t("settings.delete_address_confirmation")}
        on_cancel={() =>
          hook.set_domain_addr_delete_confirm({
            is_open: false,
            id: null,
            domain_id: null,
          })
        }
        on_confirm={hook.confirm_domain_addr_delete}
        title={t("common.delete_address")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.upgrade_plan")}
        is_open={hook.show_upgrade_modal}
        message={t("settings.upgrade_plan_more_aliases")}
        on_cancel={() => hook.set_show_upgrade_modal(false)}
        on_confirm={() => {
          hook.set_show_upgrade_modal(false);
          window.dispatchEvent(
            new CustomEvent("navigate-settings", { detail: "billing" }),
          );
        }}
        title={t("common.alias_limit_reached")}
      />
    </div>
  );
}
