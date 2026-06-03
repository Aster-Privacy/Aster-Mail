//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useEffect, useState } from "react";
import {
  PlusIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { get_alias_preferences } from "@/services/api/aliases";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_aliases } from "@/components/settings/hooks/use_aliases";
import {
  CreateAliasModal,
  compute_alias_at_limit,
} from "@/components/settings/aliases/alias_form";
import { AliasList } from "@/components/settings/aliases/alias_list";
import { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";
import { DomainCardV2 } from "@/components/settings/aliases/domain_card_v2";
import { DomainDeleteModal } from "@/components/settings/aliases/domain_delete_modal";
import { AliasDirectoriesSection } from "@/components/settings/alias_directories_section";
import { GhostAliasesSection } from "@/components/settings/ghost_aliases_section";
import { AliasImportModal } from "@/components/settings/aliases/alias_import_modal";
import { AliasPreferencesPanel } from "@/components/settings/aliases/alias_preferences_panel";

export { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";

type AliasTab = "aliases" | "domains" | "directories" | "ghost" | "preferences";

const SESSION_TAB_KEY = "alias_tab";

function download_csv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function read_initial_tab(): AliasTab {
  try {
    const stored = sessionStorage.getItem(SESSION_TAB_KEY);

    if (
      stored === "aliases" ||
      stored === "domains" ||
      stored === "directories" ||
      stored === "ghost" ||
      stored === "preferences"
    ) {
      return stored;
    }
  } catch {}

  return "aliases";
}

export function AliasesSection() {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const alias_csv_locked = is_feature_locked("has_advanced_aliases");
  const hook = use_aliases();

  const [active_tab, set_active_tab] = useState<AliasTab>(read_initial_tab);
  const [show_import_modal, set_show_import_modal] = useState(false);
  const [default_alias_domain, set_default_alias_domain] = useState<string | undefined>(undefined);

  useEffect(() => {
    get_alias_preferences().then((r) => {
      if (r.data?.alias_default_domain) {
        set_default_alias_domain(r.data.alias_default_domain);
      }
    }).catch(() => {});
  }, []);

  const handle_tab = (tab: AliasTab) => {
    set_active_tab(tab);
    try {
      sessionStorage.setItem(SESSION_TAB_KEY, tab);
    } catch {}
  };

  const handle_export_csv = () => {
    const date_str = new Date().toISOString().slice(0, 10);
    const alias_rows = hook.aliases.map((a) => [
      a.full_address,
      a.display_name ?? "",
      String(a.is_enabled),
      a.created_at ?? "",
    ]);
    const domain_rows = hook.domain_addresses.map((a) => [
      `${a.local_part}@${a.domain_name}`,
      a.display_name ?? "",
      String(a.is_enabled),
      a.created_at ?? "",
    ]);
    const rows = [
      ["alias", "note", "enabled", "created_at"],
      ...alias_rows,
      ...domain_rows,
    ];
    const csv_content = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    download_csv(`aster-aliases-${date_str}.csv`, csv_content);
  };

  useEffect(() => {
    const handle_auto_open = () => {
      handle_tab("aliases");
      hook.set_show_create_alias_modal(true);
    };

    window.addEventListener("astermail:auto-open-create-alias", handle_auto_open);

    return () => {
      window.removeEventListener(
        "astermail:auto-open-create-alias",
        handle_auto_open,
      );
    };
  }, [hook.set_show_create_alias_modal]);

  const tab_labels: { key: AliasTab; label: string }[] = [
    { key: "aliases", label: t("settings.alias_tab_aliases") },
    { key: "domains", label: t("settings.alias_tab_domains") },
    { key: "directories", label: t("settings.alias_tab_directories") },
    { key: "ghost", label: t("settings.alias_tab_ghost") },
    { key: "preferences", label: t("settings.alias_tab_preferences") },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
        {tab_labels.map(({ key, label }) => (
          <button
            key={key}
            className="relative px-5 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none"
            style={{
              backgroundColor:
                active_tab === key ? "var(--bg-primary)" : "transparent",
              color:
                active_tab === key
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              boxShadow:
                active_tab === key
                  ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                  : "none",
            }}
            type="button"
            onClick={() => handle_tab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {active_tab === "aliases" && (
        <div className="space-y-4">
          <div>
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
                  <AtSymbolIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
                  {t("settings.email_aliases")}
                </h3>
                <div className="flex items-center gap-3">
                  {hook.alias_counts && (
                    <span className="text-xs text-txt-muted">
                      {(hook.alias_counts.count ?? 0) +
                        hook.domain_addresses.length}
                      /
                      {hook.alias_counts.max === -1
                        ? "∞"
                        : (hook.alias_counts.max ?? 0)}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={alias_csv_locked ? () => prompt_upgrade("Alias CSV export") : handle_export_csv}>
                    {t("settings.alias_export_csv")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={alias_csv_locked ? () => prompt_upgrade("Alias CSV import") : () => set_show_import_modal(true)}
                  >
                    {t("settings.alias_import_csv")}
                  </Button>
                </div>
              </div>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <p className="text-sm mb-2 text-txt-muted">
              {t("settings.aliases_description")}
              {hook.domains.filter((d) => d.status === "active").length > 0 && (
                <span className="block mt-0.5 text-txt-tertiary">
                  {t("settings.custom_domain_addresses_note")}
                </span>
              )}
            </p>

            <div className="flex gap-2 mb-2">
              <Button
                className="flex-1"
                size="xl"
                variant="depth"
                onClick={() => {
                  const total_count =
                    (hook.alias_counts?.count ?? hook.aliases.length) +
                    hook.domain_addresses.length;
                  const max = hook.alias_counts?.max ?? hook.max_aliases;
                  const has_custom_domains = hook.domains.some(
                    (d) => d.status === "active",
                  );

                  if (
                    compute_alias_at_limit(max, total_count, has_custom_domains)
                  ) {
                    hook.set_show_upgrade_modal(true);
                  } else {
                    hook.set_show_create_alias_modal(true);
                  }
                }}
              >
                <PlusIcon className="w-4 h-4" />
                {t("settings.create_alias")}
              </Button>
            </div>

            <AliasList
              alias_deleting_id={hook.alias_deleting_id}
              aliases={hook.aliases}
              aliases_loading={hook.aliases_loading}
              domain_addr_deleting_id={hook.domain_addr_deleting_id}
              domain_addresses={hook.domain_addresses}
              on_alias_delete={hook.handle_alias_delete}
              on_alias_pin_toggled={hook.load_aliases}
              on_alias_toggle={hook.handle_alias_toggle}
              on_aliases_changed={hook.load_aliases}
              on_avatar_changed={hook.load_aliases}
              on_display_name_saved={hook.handle_display_name_saved}
              on_domain_addr_delete={hook.handle_domain_addr_delete}
              on_domain_address_display_name_saved={
                hook.handle_domain_address_display_name_saved
              }
              toggling_id={hook.toggling_id}
            />
          </div>

        </div>
      )}

      {active_tab === "domains" && (
        <div className="space-y-4">
          <div
            className="relative overflow-hidden rounded-2xl p-6"
            style={{
              background:
                "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #2563eb 70%, #3b82f6 100%)",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-end gap-2 pointer-events-none">
              <GlobeAltIcon
                className="w-9 h-9 text-white/[0.08]"
                style={{ transform: "translateY(-18px) rotate(-12deg)" }}
              />
              <AtSymbolIcon className="w-20 h-20 text-white/[0.12]" />
              <GlobeAltIcon
                className="w-11 h-11 text-white/[0.06]"
                style={{ transform: "translateY(-28px) rotate(15deg)" }}
              />
            </div>
            <div className="relative z-10">
              <h3
                className="text-lg font-bold text-white mb-1 tracking-tight"
                style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
              >
                {t("settings.domain_promo_title")}
              </h3>
              <p
                className="text-sm text-blue-100/70 mb-5 max-w-[280px]"
                style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
              >
                {t("settings.domain_promo_subtitle")}
              </p>
              <button
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-sm font-semibold bg-white text-blue-900"
                style={{
                  boxShadow:
                    "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.9) inset",
                }}
                onClick={hook.handle_open_add_domain}
              >
                {t("settings.domain_promo_cta")}
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!hook.domains_loading && hook.max_domains === 0 ? (
            <div className="p-6 rounded-lg text-center bg-surf-tertiary border border-edge-secondary">
              <p className="text-sm font-medium mb-1 text-txt-primary">
                {t("settings.custom_domains_not_available")}
              </p>
              <p className="text-sm mb-4 text-txt-muted">
                {t("settings.upgrade_plan_more_domains")}
              </p>
              <Button
                variant="depth"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("navigate-settings", { detail: "billing" }),
                  )
                }
              >
                {t("common.upgrade_plan")}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
                    <GlobeAltIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
                    {t("settings.custom_domains_label")}
                  </h3>
                  <span className="text-sm text-txt-muted">
                    {t("settings.used_count", {
                      current: hook.domains.length,
                      max:
                        hook.max_domains === -1 ? "∞" : hook.max_domains,
                    })}
                  </span>
                </div>
                <div className="mt-2 h-px bg-edge-secondary" />
              </div>
              <p className="text-sm mb-3 text-txt-muted">
                {t("settings.domains_description")}
              </p>

              <Button
                className="w-full mb-3"
                size="xl"
                variant="depth"
                onClick={hook.handle_open_add_domain}
              >
                <PlusIcon className="w-4 h-4" />
                {t("common.add_domain")}
              </Button>

              {hook.domains_loading ? (
                <div />
              ) : hook.domains.length === 0 ? (
                <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
                  <GlobeAltIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
                  <p className="text-sm text-txt-muted">
                    {t("settings.no_domains_yet")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hook.domains.map((domain) => (
                    <DomainCardV2
                      key={domain.id}
                      deleting={hook.domain_deleting_id === domain.id}
                      domain={domain}
                      on_delete={hook.handle_domain_delete}
                      on_domains_changed={hook.load_domains}
                      on_setup={hook.handle_open_setup}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {active_tab === "directories" && <AliasDirectoriesSection />}

      {active_tab === "ghost" && <GhostAliasesSection />}

      {active_tab === "preferences" && (
        <AliasPreferencesPanel
          available_domains={hook.available_domains_for_aliases ?? []}
        />
      )}

      <CreateAliasModal
        available_domains={hook.available_domains_for_aliases}
        current_count={hook.alias_counts?.count ?? hook.aliases.length}
        custom_domains={hook.domains}
        domain_addresses={hook.domain_addresses}
        initial_domain={default_alias_domain}
        is_open={hook.show_create_alias_modal}
        max_aliases={hook.alias_counts?.max ?? hook.max_aliases}
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

      <Modal
        is_open={hook.show_upgrade_modal}
        on_close={() => hook.set_show_upgrade_modal(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("common.alias_limit_reached")}</ModalTitle>
          <ModalDescription>
            {t("settings.alias_limit_all_used", {
              used:
                (hook.alias_counts?.count ?? hook.aliases.length) +
                hook.domain_addresses.length,
              count: hook.alias_counts?.max ?? hook.max_aliases,
            })}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-txt-secondary">
            {t("settings.upgrade_plan_more_aliases")}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => hook.set_show_upgrade_modal(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="depth"
            onClick={() => {
              hook.set_show_upgrade_modal(false);
              window.dispatchEvent(
                new CustomEvent("navigate-settings", { detail: "billing" }),
              );
            }}
          >
            {t("common.upgrade_plan")}
          </Button>
        </ModalFooter>
      </Modal>

      <AliasImportModal
        available_domains={hook.available_domains_for_aliases}
        custom_domains={hook.custom_domains_for_import}
        existing_aliases={hook.aliases}
        is_open={show_import_modal}
        on_close={() => set_show_import_modal(false)}
        on_imported={() => {
          hook.load_aliases();
          hook.load_alias_counts();
          set_show_import_modal(false);
        }}
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

      <DomainDeleteModal
        domain_name={
          hook.domains.find((d) => d.id === hook.domain_delete_confirm.id)
            ?.domain_name ?? ""
        }
        is_open={hook.domain_delete_confirm.is_open}
        on_cancel={() =>
          hook.set_domain_delete_confirm({ is_open: false, id: null })
        }
        on_confirm={hook.confirm_domain_delete}
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
    </div>
  );
}
