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
import { PlusIcon, AtSymbolIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import { get_alias_preferences } from "@/services/api/aliases";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_aliases } from "@/components/settings/hooks/use_aliases";
import {
  CreateAliasModal,
  compute_alias_at_limit,
} from "@/components/settings/aliases/alias_form";
import { AliasEditorPage } from "@/components/settings/aliases/alias_editor_page";
import { AliasList } from "@/components/settings/aliases/alias_list";
import { TwinAddressCard } from "@/components/settings/aliases/twin_address_card";
import { AliasDirectoriesSection } from "@/components/settings/alias_directories_section";
import { GhostAliasesSection } from "@/components/settings/ghost_aliases_section";
import { AliasImportModal } from "@/components/settings/aliases/alias_import_modal";
import { AliasExportModal } from "@/components/settings/aliases/alias_export_modal";
import { AliasPreferencesPanel } from "@/components/settings/aliases/alias_preferences_panel";
import { ignore_error } from "@/lib/ignore_error";

export { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";

type AliasTab = "aliases" | "directories" | "ghost" | "preferences";

const SESSION_TAB_KEY = "alias_tab";

function read_initial_tab(): AliasTab {
  try {
    const stored = sessionStorage.getItem(SESSION_TAB_KEY);

    if (
      stored === "aliases" ||
      stored === "directories" ||
      stored === "ghost" ||
      stored === "preferences"
    ) {
      return stored;
    }
  } catch (caught) {
    ignore_error(
      "components/settings/aliases_section:read_initial_tab",
      caught,
    );
  }

  return "aliases";
}

export function AliasesSection() {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const alias_csv_locked = is_feature_locked("has_advanced_aliases");
  const hook = use_aliases();

  const alias_pending_delete = hook.aliases.find(
    (a) => a.id === hook.alias_delete_confirm.id,
  );
  const domain_addr_pending_delete = hook.domain_addresses.find(
    (a) => a.id === hook.domain_addr_delete_confirm.id,
  );

  const [active_tab, set_active_tab] = useState<AliasTab>(read_initial_tab);
  const [editing_alias_id, set_editing_alias_id] = useState<string | null>(
    null,
  );
  const [editing_address_id, set_editing_address_id] = useState<string | null>(
    null,
  );
  const [twin_refresh, set_twin_refresh] = useState(0);
  const [twin_prefill, set_twin_prefill] = useState<{
    local_part: string;
    domain: string;
  } | null>(null);
  const [show_import_modal, set_show_import_modal] = useState(false);
  const [show_export_modal, set_show_export_modal] = useState(false);
  const [default_alias_domain, set_default_alias_domain] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    get_alias_preferences()
      .then((r) => {
        if (r.data?.alias_default_domain) {
          set_default_alias_domain(r.data.alias_default_domain);
        }
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/aliases_section:load_alias_preferences",
          caught,
        ),
      );
  }, []);

  const handle_tab = (tab: AliasTab) => {
    set_active_tab(tab);
    try {
      sessionStorage.setItem(SESSION_TAB_KEY, tab);
    } catch (caught) {
      ignore_error("components/settings/aliases_section:handle_tab", caught);
    }
  };

  useEffect(() => {
    const handle_auto_open = () => {
      handle_tab("aliases");
      hook.set_show_create_alias_modal(true);
    };

    window.addEventListener(
      "astermail:auto-open-create-alias",
      handle_auto_open,
    );

    return () => {
      window.removeEventListener(
        "astermail:auto-open-create-alias",
        handle_auto_open,
      );
    };
  }, [hook.set_show_create_alias_modal]);

  const editing_alias = hook.aliases.find(
    (item) => item.id === editing_alias_id,
  );
  const editing_domain_address = hook.domain_addresses.find(
    (item) => item.id === editing_address_id,
  );
  const is_editing = !!editing_alias || !!editing_domain_address;

  const close_editor = () => {
    set_editing_alias_id(null);
    set_editing_address_id(null);
  };

  const tab_labels: { key: AliasTab; label: string }[] = [
    { key: "aliases", label: t("settings.alias_tab_aliases") },
    { key: "directories", label: t("settings.alias_tab_directories") },
    { key: "ghost", label: t("settings.alias_tab_ghost") },
    { key: "preferences", label: t("settings.alias_tab_preferences") },
  ];

  return (
    <div className="space-y-4">
      <SettingsTabBar
        active={active_tab}
        layout_id="alias"
        on_change={handle_tab}
        tabs={tab_labels}
      />

      {active_tab === "aliases" && is_editing && (
        <AliasEditorPage
          alias={editing_alias}
          domain_address={editing_domain_address}
          on_back={close_editor}
          on_delivery_saved={hook.handle_delivery_saved}
          on_display_name_saved={hook.handle_display_name_saved}
          on_note_saved={hook.handle_note_saved}
          on_toggle_enabled={hook.handle_alias_toggle}
          on_websites_saved={hook.handle_websites_saved}
          toggling={!!editing_alias_id && hook.toggling_id === editing_alias_id}
        />
      )}

      {active_tab === "aliases" && !is_editing && (
        <div className="space-y-4">
          <div>
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
                  <AtSymbolIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
                  {t("settings.email_aliases")}
                </h3>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={
                      alias_csv_locked
                        ? () =>
                            prompt_upgrade(
                              t("settings.feature_requires_upgrade"),
                              undefined,
                              "has_advanced_aliases",
                            )
                        : () => set_show_export_modal(true)
                    }
                  >
                    {t("settings.alias_export_csv")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => set_show_import_modal(true)}
                  >
                    {t("settings.alias_import_csv")}
                  </Button>
                  {hook.alias_counts !== null && (
                    <span className="text-sm text-txt-muted">
                      {t("settings.used_count", {
                        current:
                          hook.alias_counts.count +
                          hook.domain_addresses.length,
                        max:
                          hook.alias_counts.max === -1
                            ? "∞"
                            : hook.alias_counts.max,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <p className="text-sm mb-2 text-txt-muted">
              {t("settings.aliases_description")}
            </p>

            <TwinAddressCard
              refresh_token={twin_refresh}
              on_claim={(local_part, domain) => {
                set_twin_prefill({ local_part, domain });
                hook.set_show_create_alias_modal(true);
              }}
            />

            <div className="flex gap-2 mb-2">
              <Button
                className="flex-1"
                size="xl"
                variant="depth"
                onClick={() => {
                  set_twin_prefill(null);

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
                    show_plan_limit_upgrade({ resource: "aliases" });
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
              aliases_load_failed={hook.aliases_load_failed}
              aliases_loading={hook.aliases_loading}
              domain_addr_deleting_id={hook.domain_addr_deleting_id}
              domain_addresses={hook.domain_addresses}
              on_alias_delete={hook.handle_alias_delete}
              on_alias_pin_toggle={hook.handle_pin_toggle}
              on_alias_toggle={hook.handle_alias_toggle}
              on_aliases_changed={hook.load_aliases}
              on_avatar_changed={hook.load_aliases}
              on_domain_addr_delete={hook.handle_domain_addr_delete}
              on_domain_address_display_name_saved={
                hook.handle_domain_address_display_name_saved
              }
              on_open_domain_editor={set_editing_address_id}
              on_open_editor={set_editing_alias_id}
              on_reload={hook.load_aliases}
              toggling_id={hook.toggling_id}
            />
          </div>
        </div>
      )}

      {active_tab === "directories" && <AliasDirectoriesSection />}

      {active_tab === "ghost" && <GhostAliasesSection />}

      {active_tab === "preferences" && (
        <AliasPreferencesPanel
          available_domains={hook.available_domains_for_aliases ?? []}
          on_default_domain_change={set_default_alias_domain}
        />
      )}

      <CreateAliasModal
        available_domains={hook.available_domains_for_aliases}
        current_count={hook.alias_counts?.count ?? hook.aliases.length}
        custom_domains={hook.domains}
        domain_addresses={hook.domain_addresses}
        initial_domain={twin_prefill?.domain ?? default_alias_domain}
        initial_local_part={twin_prefill?.local_part}
        is_open={hook.show_create_alias_modal}
        max_aliases={hook.alias_counts?.max ?? hook.max_aliases}
        on_close={() => {
          set_twin_prefill(null);
          hook.set_show_create_alias_modal(false);
        }}
        on_created={() => {
          set_twin_prefill(null);
          set_twin_refresh((value) => value + 1);
          hook.load_aliases();
          hook.load_alias_counts();
          hook.load_domain_addresses(hook.domains);
        }}
      />

      <AliasImportModal
        available_domains={hook.available_domains_for_aliases}
        custom_domains={hook.custom_domains_for_import}
        existing_aliases={hook.aliases}
        existing_domain_addresses={hook.domain_addresses}
        is_open={show_import_modal}
        on_close={() => set_show_import_modal(false)}
        on_imported={() => {
          hook.load_aliases();
          hook.load_alias_counts();
          hook.load_domain_addresses(hook.domains);
          set_show_import_modal(false);
        }}
      />

      <AliasExportModal
        aliases={hook.aliases}
        domain_addresses={hook.domain_addresses}
        is_open={show_export_modal}
        on_close={() => set_show_export_modal(false)}
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
        message={
          alias_pending_delete
            ? t("settings.delete_alias_confirmation_named", {
                address: alias_pending_delete.full_address,
              })
            : t("settings.delete_alias_confirmation")
        }
        on_cancel={() =>
          hook.set_alias_delete_confirm({ is_open: false, id: null })
        }
        on_confirm={hook.confirm_alias_delete}
        title={t("common.delete_alias")}
        variant="danger"
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={hook.domain_addr_delete_confirm.is_open}
        message={
          domain_addr_pending_delete
            ? t("settings.delete_address_confirmation_named", {
                address: `${domain_addr_pending_delete.local_part}@${domain_addr_pending_delete.domain_name}`,
              })
            : t("settings.delete_address_confirmation")
        }
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
