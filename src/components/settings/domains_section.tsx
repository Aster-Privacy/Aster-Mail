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
import { useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  GlobeAltIcon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button, Input } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  cancel_domain_order,
  list_domain_orders,
  renew_domain_order,
  type DomainOrder,
} from "@/services/api/domains";
import { TURNSTILE_SITE_KEY } from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { InfoPopover } from "@/components/ui/info_popover";
import { use_aliases } from "@/components/settings/hooks/use_aliases";
import { CreateAliasModal } from "@/components/settings/aliases/alias_form";
import { DomainSetupWizard } from "@/components/settings/aliases/domain_setup_wizard";
import { DomainPurchaseModal } from "@/components/settings/aliases/domain_purchase_modal";
import { DomainCardV2 } from "@/components/settings/aliases/domain_card_v2";
import { DomainDeleteModal } from "@/components/settings/aliases/domain_delete_modal";
import { PurchasedDomainManageModal } from "@/components/settings/aliases/purchased_domain_manage_modal";
import { is_https_payment_url } from "@/lib/payment_url";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export function DomainsSection() {
  const { t } = use_i18n();
  const hook = use_aliases();

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
        "components/settings/domains_section:set_purchase_open",
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
        "components/settings/domains_section:clear_purchase_url_param",
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
  const [search_query, set_search_query] = useState("");
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

  useEffect(() => {
    if (purchase_open) return;
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
          "components/settings/domains_section:load_purchased_orders",
          caught,
        );
      })
      .finally(() => set_purchased_loading(false));
  }, [purchase_open, purchased_reload]);

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
        "components/settings/domains_section:read_pending_order",
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
          "components/settings/domains_section:clear_cancelled_params",
          caught,
        );
      }

      if (cancelled_id) {
        cancel_domain_order(cancelled_id).catch((caught) =>
          ignore_error(
            "components/settings/domains_section:cancel_pending_order",
            caught,
          ),
        );
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
          "components/settings/domains_section:restore_order_param",
          caught,
        );
      }
    }
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
        "components/settings/domains_section:handle_cancel_order",
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

  const open_purchase_flow = (initial_query: string | null = null) => {
    set_purchase_order_id(null);
    set_purchase_initial_query(initial_query);
    set_purchase_open(true);
  };

  const normalized_query = search_query.trim().toLowerCase();
  const visible_domains = useMemo(
    () =>
      normalized_query
        ? hook.domains.filter((domain) =>
            domain.domain_name.toLowerCase().includes(normalized_query),
          )
        : hook.domains,
    [hook.domains, normalized_query],
  );
  const visible_orders = useMemo(
    () =>
      normalized_query
        ? purchased_orders.filter((order) =>
            order.domain.toLowerCase().includes(normalized_query),
          )
        : purchased_orders,
    [purchased_orders, normalized_query],
  );
  const owned_domain_count = hook.domains.filter(
    (domain) => !domain.purchased,
  ).length;

  const searching_with_no_results =
    normalized_query.length > 0 &&
    visible_domains.length === 0 &&
    visible_orders.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <GlobeAltIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.alias_tab_domains")}
            </h3>
            {!hook.domains_loading && hook.max_domains !== 0 && (
              <span className="text-sm text-txt-muted">
                {t("settings.used_count", {
                  current: owned_domain_count,
                  max: hook.max_domains === -1 ? "∞" : hook.max_domains,
                })}
              </span>
            )}
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          {t("settings.domains_page_description")}
        </p>

        {!hook.domains_loading && hook.domains_load_failed ? (
          <div className="p-6 rounded-lg text-center bg-surf-tertiary border border-edge-secondary">
            <p className="text-sm mb-4 text-txt-secondary">
              {t("common.something_went_wrong_try_again")}
            </p>
            <Button variant="outline" onClick={() => void hook.load_domains()}>
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
            <div className="mb-3 space-y-2">
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={hook.handle_open_add_domain}
              >
                <PlusIcon className="w-4 h-4" />
                {t("settings.add_domain_you_own")}
              </Button>
              {hook.domains.length + purchased_orders.length >= 5 && (
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
                  <Input
                    placeholder={t("settings.search_domains_placeholder")}
                    size="md"
                    style={{ paddingInlineStart: "38px" }}
                    value={search_query}
                    onChange={(event) => set_search_query(event.target.value)}
                  />
                </div>
              )}
            </div>

            {searching_with_no_results ? (
              <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
                <MagnifyingGlassIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
                <p className="text-sm text-txt-muted">
                  {t("settings.no_matching_domains")}
                </p>
              </div>
            ) : hook.domains_loading ? (
              <div />
            ) : visible_domains.length === 0 && !normalized_query ? (
              <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
                <GlobeAltIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
                <p className="text-sm text-txt-muted">
                  {t("settings.no_domains_yet")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible_domains.map((domain) => (
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

            {!searching_with_no_results && (
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
                  {visible_orders.length > 0 && (
                    <span className="text-sm text-txt-muted">
                      {visible_orders.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-px bg-edge-secondary" />
                <p className="text-sm mt-3 text-txt-muted">
                  {t("settings.domain_purchase_purchased_desc")}
                </p>
                <Button
                  className="w-full mt-3 mb-3"
                  size="xl"
                  variant="depth"
                  onClick={() => open_purchase_flow()}
                >
                  <ShoppingBagIcon className="w-4 h-4" />
                  {t("settings.buy_new_domain")}
                </Button>
                {purchased_loading && purchased_orders.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Spinner className="text-txt-muted" size="sm" />
                  </div>
                ) : purchased_load_failed && purchased_orders.length === 0 ? (
                  <LoadFailedNotice
                    on_retry={() => set_purchased_reload((value) => value + 1)}
                  />
                ) : visible_orders.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary mt-3">
                    <ShoppingBagIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
                    <p className="text-sm text-txt-muted">
                      {t("settings.domain_purchase_purchased_empty")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-edge-secondary/60">
                    {visible_orders.map((order) => (
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
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    open_purchase_flow(order.domain);
                                  }}
                                >
                                  {t("settings.domain_purchase_complete_cta")}
                                </button>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-edge-secondary text-txt-secondary hover:text-txt-primary hover:bg-surf-secondary transition-colors"
                                  disabled={cancelling_order_id === order.id}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
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
                                onClick={(event) => {
                                  event.stopPropagation();
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
            )}
          </>
        )}
      </div>

      <DomainSetupWizard
        current_count={owned_domain_count}
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
      <DomainPurchaseModal
        initial_order_id={purchase_order_id}
        initial_query={purchase_initial_query}
        is_open={purchase_open}
        on_close={close_purchase}
        on_create_address={() => {
          close_purchase();
          hook.set_show_create_alias_modal(true);
        }}
        on_purchased={hook.load_domains}
      />
      <CreateAliasModal
        available_domains={hook.available_domains_for_aliases}
        current_count={hook.alias_counts?.count ?? hook.aliases.length}
        custom_domains={hook.domains}
        domain_addresses={hook.domain_addresses}
        is_open={hook.show_create_alias_modal}
        max_aliases={hook.alias_counts?.max ?? hook.max_aliases}
        on_close={() => hook.set_show_create_alias_modal(false)}
        on_created={() => {
          hook.load_aliases();
          hook.load_alias_counts();
          hook.load_domain_addresses(hook.domains);
        }}
      />
    </div>
  );
}
