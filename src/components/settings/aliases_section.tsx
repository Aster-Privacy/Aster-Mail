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
  ArrowLeftIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import { get_alias_preferences } from "@/services/api/aliases";
import {
  cancel_domain_order,
  list_domain_orders,
  renew_domain_order,
  type DomainOrder,
} from "@/services/api/domains";
import { TURNSTILE_SITE_KEY } from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { InfoPopover } from "@/components/ui/info_popover";
import { use_aliases } from "@/components/settings/hooks/use_aliases";
import {
  CreateAliasModal,
  compute_alias_at_limit,
} from "@/components/settings/aliases/alias_form";
import { AliasEditorPage } from "@/components/settings/aliases/alias_editor_page";
import { AliasList } from "@/components/settings/aliases/alias_list";
import { TwinAddressCard } from "@/components/settings/aliases/twin_address_card";
import { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";
import { DomainPurchaseFlow } from "@/components/settings/aliases/domain_purchase_flow";
import { DomainCardV2 } from "@/components/settings/aliases/domain_card_v2";
import { DomainDeleteModal } from "@/components/settings/aliases/domain_delete_modal";
import { PurchasedDomainManageModal } from "@/components/settings/aliases/purchased_domain_manage_modal";
import { AliasDirectoriesSection } from "@/components/settings/alias_directories_section";
import { GhostAliasesSection } from "@/components/settings/ghost_aliases_section";
import { AliasImportModal } from "@/components/settings/aliases/alias_import_modal";
import { AliasExportModal } from "@/components/settings/aliases/alias_export_modal";
import { AliasPreferencesPanel } from "@/components/settings/aliases/alias_preferences_panel";
import { is_https_payment_url } from "@/lib/payment_url";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";

type AliasTab = "aliases" | "domains" | "directories" | "ghost" | "preferences";

const SESSION_TAB_KEY = "alias_tab";

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

  const [active_tab, set_active_tab] = useState<AliasTab>(read_initial_tab);
  const [purchase_open, set_purchase_open_state] = useState(() => {
    try {
      return sessionStorage.getItem("alias_domains_purchase_open") === "1";
    } catch {
      return false;
    }
  });
  const set_purchase_open = (open: boolean) => {
    set_purchase_open_state(open);
    try {
      if (open) {
        sessionStorage.setItem("alias_domains_purchase_open", "1");
      } else {
        sessionStorage.removeItem("alias_domains_purchase_open");
      }
    } catch (caught) {
      ignore_error(
        "components/settings/aliases_section:set_purchase_open",
        caught,
      );
    }
  };
  const [purchase_order_id, set_purchase_order_id] = useState<string | null>(
    null,
  );
  const [purchase_initial_query, set_purchase_initial_query] = useState<
    string | null
  >(null);
  const clear_purchase_url_param = () => {
    try {
      const url = new URL(window.location.href);

      if (url.searchParams.has("domain_order")) {
        url.searchParams.delete("domain_order");
        window.history.replaceState({}, "", url.toString());
      }
    } catch (caught) {
      ignore_error(
        "components/settings/aliases_section:clear_purchase_url_param",
        caught,
      );
    }
  };
  const close_purchase = () => {
    set_purchase_open(false);
    set_purchase_order_id(null);
    set_purchase_initial_query(null);
    clear_purchase_url_param();
  };
  const [promo_dismissed, set_promo_dismissed] = useState(() => {
    try {
      return (
        localStorage.getItem("aster_domain_promo_banner_dismissed") === "1"
      );
    } catch {
      return false;
    }
  });
  const [purchased_orders, set_purchased_orders] = useState<DomainOrder[]>([]);
  const [purchased_loading, set_purchased_loading] = useState(false);
  const [purchased_load_failed, set_purchased_load_failed] = useState(false);
  const [purchased_reload, set_purchased_reload] = useState(0);
  const [renewing_order_id, set_renewing_order_id] = useState<string | null>(
    null,
  );
  const [cancelling_order_id, set_cancelling_order_id] = useState<
    string | null
  >(null);
  const [renew_errors, set_renew_errors] = useState<Record<string, string>>({});
  const [renew_captcha_order_id, set_renew_captcha_order_id] = useState<
    string | null
  >(null);
  const [manage_order_id, set_manage_order_id] = useState<string | null>(null);
  const manage_order =
    purchased_orders.find((order) => order.id === manage_order_id) ?? null;
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
          "components/settings/aliases_section:close_purchase",
          caught,
        ),
      );
  }, []);

  useEffect(() => {
    if (active_tab !== "domains" || purchase_open) return;
    set_purchased_loading(true);
    set_purchased_load_failed(false);
    list_domain_orders()
      .then((r) => {
        if (r.data) {
          set_purchased_orders(
            r.data.orders.filter(
              (o) =>
                o.order_type === "registration" &&
                !["expired", "refunded", "failed"].includes(o.status),
            ),
          );

          return;
        }
        set_purchased_load_failed(true);
      })
      .catch((caught) => {
        set_purchased_load_failed(true);
        ignore_error(
          "components/settings/aliases_section:close_purchase",
          caught,
        );
      })
      .finally(() => set_purchased_loading(false));
  }, [active_tab, purchase_open, purchased_reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url_order_id = params.get("domain_order");
    let stashed_order_id: string | null = null;

    try {
      stashed_order_id = sessionStorage.getItem("aster_pending_domain_order");
      if (stashed_order_id) {
        sessionStorage.removeItem("aster_pending_domain_order");
      }
    } catch (caught) {
      ignore_error(
        "components/settings/aliases_section:close_purchase",
        caught,
      );
    }

    if (params.get("cancelled") === "1") {
      const cancelled_id = url_order_id ?? stashed_order_id;

      try {
        const url = new URL(window.location.href);

        url.searchParams.delete("domain_order");
        url.searchParams.delete("cancelled");
        window.history.replaceState({}, "", url.toString());
      } catch (caught) {
        ignore_error(
          "components/settings/aliases_section:close_purchase",
          caught,
        );
      }

      if (cancelled_id) {
        cancel_domain_order(cancelled_id).catch((caught) =>
          ignore_error(
            "components/settings/aliases_section:close_purchase",
            caught,
          ),
        );
        set_active_tab("domains");
      }

      return;
    }

    const order_id = url_order_id ?? stashed_order_id;

    if (!order_id) return;
    if (!url_order_id) {
      try {
        const url = new URL(window.location.href);

        url.searchParams.set("domain_order", order_id);
        window.history.replaceState({}, "", url.toString());
      } catch (caught) {
        ignore_error(
          "components/settings/aliases_section:close_purchase",
          caught,
        );
      }
    }
    set_active_tab("domains");
    set_purchase_order_id(order_id);
    set_purchase_open(true);
  }, []);

  useEffect(() => {
    if (!purchase_open) return;
    window.history.pushState({ aster_domain_purchase: true }, "");
    const handle_pop = () => {
      close_purchase();
    };

    window.addEventListener("popstate", handle_pop);

    return () => window.removeEventListener("popstate", handle_pop);
  }, [purchase_open]);

  useEffect(() => {
    const open_purchase = () => {
      set_active_tab("domains");
      set_purchase_order_id(null);
      set_purchase_initial_query(null);
      set_purchase_open(true);
    };

    window.addEventListener("aster:open-domain-purchase", open_purchase);

    return () =>
      window.removeEventListener("aster:open-domain-purchase", open_purchase);
  }, []);

  const handle_cancel_order = async (order_id: string) => {
    set_cancelling_order_id(order_id);
    try {
      const response = await cancel_domain_order(order_id);

      if (response.data?.success) {
        set_purchased_orders((prev) =>
          prev.filter((order) => order.id !== order_id),
        );
      } else {
        show_toast(
          response.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } catch (caught) {
      ignore_error(
        "components/settings/aliases_section:handle_cancel_order",
        caught,
      );
      show_toast(t("common.something_went_wrong_try_again"), "error");
    } finally {
      set_cancelling_order_id(null);
    }
  };

  const handle_renew = async (order_id: string, captcha_token?: string) => {
    set_renewing_order_id(order_id);
    set_renew_errors((prev) => {
      const next = { ...prev };

      delete next[order_id];

      return next;
    });
    try {
      const response = await renew_domain_order(
        order_id,
        1,
        "stripe",
        captcha_token,
      );

      if (
        response.data?.checkout_url &&
        is_https_payment_url(response.data.checkout_url)
      ) {
        window.location.href = response.data.checkout_url;

        return;
      }
      set_renew_errors((prev) => ({
        ...prev,
        [order_id]:
          response.error ?? t("common.something_went_wrong_try_again"),
      }));
    } catch (err) {
      set_renew_errors((prev) => ({
        ...prev,
        [order_id]:
          err instanceof Error
            ? err.message
            : t("common.something_went_wrong_try_again"),
      }));
    } finally {
      set_renewing_order_id(null);
      set_renew_captcha_order_id(null);
    }
  };

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
    { key: "domains", label: t("settings.alias_tab_domains") },
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

      {active_tab === "domains" && purchase_open && (
        <div>
          <div className="mb-4">
            <div className="flex items-center gap-2 -ms-2">
              <button
                aria-label={t("common.back")}
                className="w-9 h-9 rounded-full flex items-center justify-center text-txt-secondary hover:bg-surf-secondary hover:text-txt-primary transition-colors"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("aster:domain-purchase-header-back"),
                  )
                }
              >
                <ArrowLeftIcon className="w-[18px] h-[18px] rtl:-scale-x-100" />
              </button>
              <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
                {t("settings.domain_purchase_title")}
                <InfoPopover
                  description={t("settings.domain_purchase_purchased_info")}
                  title={t("settings.domain_purchase_title")}
                />
              </h3>
            </div>
            <div className="mt-3 h-px bg-edge-secondary" />
          </div>
          <DomainPurchaseFlow
            initial_order_id={purchase_order_id}
            initial_query={purchase_initial_query}
            on_create_address={() => {
              close_purchase();
              hook.set_show_create_alias_modal(true);
            }}
            on_done={close_purchase}
            on_purchased={hook.load_domains}
          />
        </div>
      )}

      {active_tab === "domains" && !purchase_open && (
        <div className="space-y-4">
          {!promo_dismissed &&
            !purchased_orders.some((o) => o.status === "complete") && (
              <div className="rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-txt-primary">
                      {t("settings.domain_purchase_banner_title")}
                    </p>
                    <p className="text-sm text-txt-muted mt-1">
                      {t("settings.domain_purchase_banner_subtitle")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <button
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--accent-fg,#ffffff)] bg-[var(--accent-color)] hover:opacity-90 transition-opacity"
                      type="button"
                      onClick={() => {
                        set_purchase_order_id(null);
                        set_purchase_initial_query(null);
                        set_purchase_open(true);
                      }}
                    >
                      {t("settings.domain_purchase_banner_cta")}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        set_promo_dismissed(true);
                        try {
                          localStorage.setItem(
                            "aster_domain_promo_banner_dismissed",
                            "1",
                          );
                        } catch (caught) {
                          ignore_error(
                            "components/settings/aliases_section:close_editor",
                            caught,
                          );
                        }
                      }}
                    >
                      {t("settings.account_security_dont_show_again")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

          {!hook.domains_loading && hook.domains_load_failed ? (
            <div className="p-6 rounded-lg text-center bg-surf-tertiary border border-edge-secondary">
              <p className="text-sm mb-4 text-txt-secondary">
                {t("common.something_went_wrong_try_again")}
              </p>
              <Button
                variant="outline"
                onClick={() => void hook.load_domains()}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : !hook.domains_loading && hook.max_domains === 0 ? (
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
                      max: hook.max_domains === -1 ? "∞" : hook.max_domains,
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

              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
                    <ShoppingBagIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
                    {t("settings.domain_purchase_purchased_label")}
                    <InfoPopover
                      description={t("settings.domain_purchase_purchased_info")}
                      title={t("settings.domain_purchase_purchased_label")}
                    />
                  </h3>
                  {purchased_orders.length > 0 && (
                    <span className="text-sm text-txt-muted">
                      {purchased_orders.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-px bg-edge-secondary" />
                <p className="text-sm mt-3 text-txt-muted">
                  {t("settings.domain_purchase_purchased_desc")}
                </p>
                <Button
                  className="w-full mt-3"
                  size="xl"
                  variant="depth"
                  onClick={() => {
                    set_purchase_order_id(null);
                    set_purchase_initial_query(null);
                    set_purchase_open(true);
                  }}
                >
                  <ShoppingBagIcon className="w-4 h-4" />
                  {t("settings.domain_purchase_banner_cta")}
                </Button>
                {purchased_loading && purchased_orders.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Spinner className="text-txt-muted" size="sm" />
                  </div>
                ) : purchased_load_failed && purchased_orders.length === 0 ? (
                  <LoadFailedNotice
                    on_retry={() => set_purchased_reload((value) => value + 1)}
                  />
                ) : purchased_orders.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary mt-3">
                    <ShoppingBagIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
                    <p className="text-sm text-txt-muted">
                      {t("settings.domain_purchase_purchased_empty")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-edge-secondary/60">
                    {purchased_orders.map((order) => (
                      <div key={order.id}>
                        <div
                          className={`w-full flex items-center justify-between gap-3 py-3 px-1 text-start ${
                            order.status === "pending_payment"
                              ? "cursor-default"
                              : "hover:bg-surf-secondary rounded-lg cursor-pointer"
                          }`}
                          onClick={() => {
                            if (order.status === "pending_payment") {
                              return;
                            }
                            if (order.status === "complete") {
                              set_manage_order_id(order.id);

                              return;
                            }
                            set_purchase_order_id(
                              order.status === "lapsed" ? null : order.id,
                            );
                            set_purchase_open(true);
                          }}
                        >
                          <span className="text-sm font-medium text-txt-primary truncate">
                            {order.domain}
                          </span>
                          <span className="flex items-center gap-3 flex-shrink-0">
                            {order.status === "pending_payment" && (
                              <>
                                <button
                                  className="px-3 py-1 rounded-full text-xs font-semibold text-[var(--accent-fg,#ffffff)] bg-[var(--accent-color)] hover:opacity-90 transition-opacity"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    set_purchase_order_id(null);
                                    set_purchase_initial_query(order.domain);
                                    set_purchase_open(true);
                                  }}
                                >
                                  {t("settings.domain_purchase_complete_cta")}
                                </button>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-edge-secondary text-txt-secondary hover:text-txt-primary hover:bg-surf-secondary transition-colors"
                                  disabled={cancelling_order_id === order.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handle_cancel_order(order.id);
                                  }}
                                >
                                  {cancelling_order_id === order.id && (
                                    <Spinner size="xs" />
                                  )}
                                  {t("common.cancel")}
                                </button>
                              </>
                            )}
                            {order.status === "complete" && (
                              <button
                                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-edge-secondary text-txt-secondary hover:text-txt-primary hover:bg-surf-secondary transition-colors"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  set_manage_order_id(order.id);
                                }}
                              >
                                {(renewing_order_id === order.id ||
                                  renew_captcha_order_id === order.id) && (
                                  <Spinner size="xs" />
                                )}
                                {t("settings.domain_purchase_manage")}
                              </button>
                            )}
                            <span
                              className={`text-[13px] ${
                                order.status === "lapsed"
                                  ? "text-[var(--color-danger)]"
                                  : "text-txt-muted"
                              }`}
                            >
                              {order.status === "complete"
                                ? order.expires_at
                                  ? t(
                                      "settings.domain_purchase_purchased_expires",
                                      {
                                        date: new Date(
                                          order.expires_at,
                                        ).toLocaleDateString(app_locale(), {
                                          timeZone: get_display_time_zone(),
                                        }),
                                      },
                                    )
                                  : ""
                                : order.status === "lapsed"
                                  ? t(
                                      "settings.domain_purchase_purchased_lapsed",
                                    )
                                  : order.status === "pending_payment"
                                    ? t(
                                        "settings.domain_purchase_purchased_awaiting",
                                      )
                                    : t(
                                        "settings.domain_purchase_purchased_in_progress",
                                      )}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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

      <PurchasedDomainManageModal
        captcha_pending={
          manage_order !== null && renew_captcha_order_id === manage_order.id
        }
        custom_domain={
          manage_order?.custom_domain_id
            ? hook.domains.find((d) => d.id === manage_order.custom_domain_id)
            : undefined
        }
        is_open={manage_order !== null}
        on_close={() => {
          set_manage_order_id(null);
          set_renew_captcha_order_id(null);
        }}
        on_open_setup={hook.handle_open_setup}
        on_renew={(captcha_token) => {
          if (!manage_order) return;
          if (TURNSTILE_SITE_KEY && !captcha_token) {
            set_renew_errors((prev) => {
              const next = { ...prev };

              delete next[manage_order.id];

              return next;
            });
            set_renew_captcha_order_id(manage_order.id);

            return;
          }
          void handle_renew(manage_order.id, captcha_token);
        }}
        order={manage_order}
        renew_error={manage_order ? renew_errors[manage_order.id] : undefined}
        renewing={
          manage_order !== null && renewing_order_id === manage_order.id
        }
      />
    </div>
  );
}
