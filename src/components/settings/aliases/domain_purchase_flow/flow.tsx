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
import { apply_input_transform } from "@/utils/input_transform";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import {
  filter_results,
  sort_results,
  paginate,
  type results_filter,
  type results_sort,
} from "../domain_results_utils";

import {
  DomainPurchaseFlowProps,
  PurchaseView,
  ResultRow,
  SkeletonRows,
  TERMINAL_ORDER_STATUSES,
  TermsSentence,
  checkout_error_key,
  read_checkout_draft,
  write_checkout_draft,
} from "./shared";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import {
  search_purchasable_domains,
  create_domain_checkout,
  get_domain_order,
  format_domain_price,
  type DomainSearchResult,
  type DomainOrder,
} from "@/services/api/domains";
import type {} from "@/services/api/client";
import { is_https_payment_url } from "@/lib/payment_url";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";

const MAX_RATE_LIMIT_RETRIES = 5;

export function DomainPurchaseFlow({
  initial_order_id,
  initial_query,
  on_done,
  on_purchased,
  on_create_address,
}: DomainPurchaseFlowProps) {
  const { t } = use_i18n();
  const [leave_url, set_leave_url] = useState<string | null>(null);
  const restored_checkout = useRef(
    initial_order_id || initial_query ? null : read_checkout_draft(),
  );
  const [view, set_view] = useState<PurchaseView>(() => {
    if (initial_order_id) return "progress";

    return restored_checkout.current ? "confirm" : "search";
  });
  const [query, set_query_state] = useState(() => {
    if (initial_query) return initial_query;
    try {
      return sessionStorage.getItem("alias_domains_purchase_query") ?? "";
    } catch {
      return "";
    }
  });
  const set_query = (q: string) => {
    set_query_state(q);
    try {
      sessionStorage.setItem("alias_domains_purchase_query", q);
    } catch (caught) {
      ignore_error(
        "components/settings/aliases/domain_purchase_flow/flow:set_query",
        caught,
      );
    }
  };
  const [searching, set_searching] = useState(false);
  const [results, set_results] = useState<DomainSearchResult[]>([]);
  const [suggestions, set_suggestions] = useState<DomainSearchResult[]>([]);
  const [results_query, set_results_query] = useState("");
  const [filter, set_filter] = useState<results_filter>("all");
  const [sort] = useState<results_sort>("relevance");
  const [active_tld, set_active_tld] = useState<string | null>(null);
  const [max_price, set_max_price] = useState<number | null>(null);
  const [visible_count, set_visible_count] = useState(10);
  const [has_more_suggestions, set_has_more_suggestions] = useState(false);
  const [suggest_pages, set_suggest_pages] = useState(1);
  const [loading_more_suggestions, set_loading_more_suggestions] =
    useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [unavailable, set_unavailable] = useState(false);
  const [selected, set_selected] = useState<DomainSearchResult | null>(
    restored_checkout.current?.selected ?? null,
  );
  const [years, set_years] = useState(restored_checkout.current?.years ?? 1);
  const [payment_method, set_payment_method] = useState<"stripe" | "crypto">(
    restored_checkout.current?.payment_method ?? "stripe",
  );
  const [buying, set_buying] = useState(false);
  const [order, set_order] = useState<DomainOrder | null>(null);
  const order_id = initial_order_id ?? null;
  const [poll_count, set_poll_count] = useState(0);
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query_ref = useRef("");
  const rate_limit_retries = useRef(0);
  const purchased_notified = useRef(false);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (initial_order_id) set_view("progress");
  }, [initial_order_id]);

  useEffect(() => {
    if (view === "confirm" && selected) {
      write_checkout_draft({ selected, years, payment_method });
    } else if (view !== "confirm") {
      write_checkout_draft(null);
    }
  }, [view, selected, years, payment_method]);

  const run_search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();

      if (trimmed.length < 3) {
        set_results([]);
        set_suggestions([]);
        set_has_more_suggestions(false);
        set_suggest_pages(1);
        set_results_query("");
        set_searching(false);

        return;
      }
      set_searching(true);
      set_error(null);
      set_unavailable(false);
      try {
        const response = await search_purchasable_domains(trimmed);

        if (query_ref.current.trim() !== trimmed) return;
        if (response.data) {
          rate_limit_retries.current = 0;
          set_results(response.data.results);
          set_suggestions(response.data.suggestions ?? []);
          set_has_more_suggestions(response.data.has_more_suggestions ?? false);
          set_suggest_pages(response.data.next_suggest_page ?? 1);
          set_results_query(trimmed);
          set_searching(false);
        } else {
          if (
            response.code === "RATE_LIMIT_EXCEEDED" &&
            rate_limit_retries.current < MAX_RATE_LIMIT_RETRIES
          ) {
            rate_limit_retries.current += 1;
            if (retry_ref.current) clearTimeout(retry_ref.current);
            retry_ref.current = setTimeout(() => {
              if (query_ref.current.trim() === trimmed) run_search(trimmed);
            }, 1100);

            return;
          }
          if (response.code === "RATE_LIMIT_EXCEEDED") {
            rate_limit_retries.current = 0;
            set_searching(false);
            set_error(t("settings.domain_purchase_search_failed"));

            return;
          }
          set_searching(false);
          if (response.code === "NOT_FOUND") {
            set_unavailable(true);
            set_error(t("settings.domain_purchase_not_released"));
          } else {
            set_error(t("settings.domain_purchase_search_failed"));
          }
        }
      } catch {
        if (query_ref.current.trim() !== trimmed) return;
        set_searching(false);
        set_error(t("settings.domain_purchase_search_failed"));
      }
    },
    [t],
  );

  useEffect(() => {
    if (view !== "search") return;
    query_ref.current = query;
    rate_limit_retries.current = 0;
    if (debounce_ref.current) clearTimeout(debounce_ref.current);
    if (retry_ref.current) clearTimeout(retry_ref.current);
    debounce_ref.current = setTimeout(() => run_search(query), 800);

    return () => {
      if (debounce_ref.current) clearTimeout(debounce_ref.current);
      if (retry_ref.current) clearTimeout(retry_ref.current);
    };
  }, [query, view, run_search]);

  useEffect(() => {
    if (view !== "progress" || !order_id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      try {
        const response = await get_domain_order(order_id);

        if (cancelled) return;
        if (response.data) {
          set_order(response.data);
          if (
            response.data.status === "complete" &&
            !purchased_notified.current
          ) {
            purchased_notified.current = true;
            on_purchased();
          }
          if (TERMINAL_ORDER_STATUSES.has(response.data.status) && timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      } catch {
        return;
      }
    };

    poll();
    timer = setInterval(() => {
      set_poll_count((c) => c + 1);
      poll();
    }, 3000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [view, order_id, on_purchased]);

  const handle_buy = async () => {
    if (!selected) return;
    set_buying(true);
    set_error(null);
    try {
      const response = await create_domain_checkout(
        selected.domain,
        years,
        payment_method,
        captcha_token ?? undefined,
      );

      if (response.data && is_https_payment_url(response.data.checkout_url)) {
        write_checkout_draft(null);
        try {
          sessionStorage.setItem(
            "aster_pending_domain_order",
            response.data.order_id,
          );
          sessionStorage.removeItem("alias_domains_purchase_query");
        } catch (caught) {
          ignore_error(
            "components/settings/aliases/domain_purchase_flow/flow:handle_buy",
            caught,
          );
        }
        window.location.href = response.data.checkout_url;
      } else {
        set_error(t(checkout_error_key(response.code, response.server_code)));
        set_captcha_token(null);
        turnstile_ref.current?.reset();
        set_buying(false);
      }
    } catch {
      set_error(t("settings.domain_purchase_error"));
      set_captcha_token(null);
      turnstile_ref.current?.reset();
      set_buying(false);
    }
  };

  const progress_steps: { key: string; label: string }[] = [
    { key: "paid", label: t("settings.domain_purchase_step_payment") },
    {
      key: "registering",
      label: t("settings.domain_purchase_step_registering"),
    },
    { key: "configuring_dns", label: t("settings.domain_purchase_step_dns") },
    { key: "activating", label: t("settings.domain_purchase_step_activating") },
    { key: "complete", label: t("settings.domain_purchase_step_done") },
  ];

  const status = order?.status ?? "paid";
  const awaiting_payment = status === "pending_payment";
  const step_index =
    status === "complete"
      ? progress_steps.length
      : Math.max(
          progress_steps.findIndex((s) => s.key === status),
          status === "awaiting_funds" ? 1 : 0,
        );
  const failed =
    status === "refund_pending" || status === "refunded" || status === "failed";
  const closed = status === "expired" || status === "lapsed";
  const slow = poll_count > 20 && status !== "complete" && !failed && !closed;
  const complete = status === "complete" && order !== null;

  const selected_total =
    selected?.price_cents != null
      ? selected.price_cents +
        (selected.renewal_price_cents ?? selected.price_cents) *
          Math.max(0, years - 1)
      : null;
  const showing_stale = searching && results_query !== query.trim();
  const active_search = query.trim().length >= 3;
  const has_rows = results.length > 0 || suggestions.length > 0;
  const filtered_results = useMemo(
    () =>
      sort_results(
        filter_results(results, filter, active_tld, max_price),
        sort,
      ),
    [results, filter, active_tld, max_price, sort],
  );
  const visible_results = paginate(filtered_results, visible_count);
  const best_match =
    visible_results.find((r) => r.available && r.price_cents !== null) ?? null;
  const rest_results = best_match
    ? visible_results.filter((r) => r.domain !== best_match.domain)
    : visible_results;

  useEffect(() => {
    set_filter("all");
    set_active_tld(null);
    set_max_price(null);
    set_visible_count(10);
  }, [results_query]);

  const load_more_suggestions = async () => {
    const trimmed = results_query;

    if (!trimmed || loading_more_suggestions) return;
    set_loading_more_suggestions(true);
    try {
      const response = await search_purchasable_domains(trimmed, suggest_pages);

      if (query_ref.current.trim() !== trimmed) return;
      if (response.data) {
        const incoming = response.data.suggestions ?? [];

        set_suggestions((prev) => {
          const seen = new Set(prev.map((s) => s.domain));

          return [...prev, ...incoming.filter((s) => !seen.has(s.domain))];
        });
        set_suggest_pages(response.data.next_suggest_page ?? suggest_pages + 1);
        set_has_more_suggestions(response.data.has_more_suggestions ?? false);
      } else {
        show_toast(t("settings.domain_purchase_search_failed"), "error");
      }
    } catch (caught) {
      show_toast(t("settings.domain_purchase_search_failed"), "error");
      ignore_error(
        "components/settings/aliases/domain_purchase_flow/flow:load_more_suggestions",
        caught,
      );
    } finally {
      set_loading_more_suggestions(false);
    }
  };

  const leave_modal = (
    <ConfirmationModal
      confirm_text={t("common.continue")}
      is_open={!!leave_url}
      message={t("settings.domain_purchase_leave_message", {
        host: (() => {
          try {
            return leave_url ? new URL(leave_url).host : "";
          } catch {
            return "";
          }
        })(),
      })}
      on_cancel={() => set_leave_url(null)}
      on_confirm={() => {
        if (leave_url) window.open(leave_url, "_blank", "noopener,noreferrer");
        set_leave_url(null);
      }}
      title={t("settings.domain_purchase_leave_title")}
      variant="info"
    />
  );

  if (view === "progress") {
    return (
      <div className="max-w-[440px] mx-auto py-6">
        {failed || closed ? (
          <div className="flex flex-col items-center text-center py-4">
            <ExclamationTriangleIcon className="w-9 h-9 text-yellow-500 mb-4" />
            <p className="text-sm text-txt-primary max-w-[360px] mb-5">
              {closed
                ? status === "lapsed"
                  ? t("settings.domain_purchase_order_lapsed")
                  : t("settings.domain_purchase_order_expired")
                : t("settings.domain_purchase_refunded")}
            </p>
            <Button variant="outline" onClick={on_done}>
              {t("common.close")}
            </Button>
          </div>
        ) : complete ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-4"
            initial={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <CheckCircleSolid className="w-12 h-12 text-green-500 mb-4" />
            <p className="text-lg font-semibold text-txt-primary mb-1.5">
              {order?.domain}
            </p>
            <p className="text-sm text-txt-secondary max-w-[340px] mb-3">
              {t("settings.domain_purchase_done_note")}
            </p>
            <p className="text-xs text-txt-muted max-w-[360px] mb-6">
              {t("settings.domain_purchase_done_warmup")}
            </p>
            <div className="flex flex-col items-center gap-2 w-full max-w-[280px]">
              {on_create_address && (
                <Button
                  className="w-full"
                  variant="depth"
                  onClick={on_create_address}
                >
                  {t("settings.domain_purchase_create_first_address")}
                </Button>
              )}
              <Button
                className="w-full"
                variant={on_create_address ? "ghost" : "depth"}
                onClick={on_done}
              >
                {t("common.done")}
              </Button>
            </div>
          </motion.div>
        ) : !order ? (
          <div className="flex justify-center py-16">
            <Spinner className="text-txt-muted" size="md" />
          </div>
        ) : awaiting_payment ? (
          <div className="flex flex-col items-center text-center py-4">
            <p className="text-lg font-semibold text-txt-primary mb-1.5">
              {order.domain}
            </p>
            <p className="text-sm font-medium text-txt-primary mb-2">
              {t("settings.domain_purchase_purchased_awaiting")}
            </p>
            <p className="text-sm text-txt-secondary max-w-[380px] mb-6">
              {t("settings.domain_purchase_awaiting_note")}
            </p>
            <div className="flex flex-col items-center gap-2 w-full max-w-[280px]">
              <Button
                className="w-full"
                variant="depth"
                onClick={() => {
                  set_query(order.domain);
                  set_order(null);
                  set_view("search");
                }}
              >
                {t("settings.domain_purchase_complete_cta")}
              </Button>
              <Button className="w-full" variant="ghost" onClick={on_done}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-txt-primary mb-2 text-center">
              {t("settings.domain_purchase_progress_title", {
                domain: order?.domain ?? "...",
              })}
            </p>
            <p className="text-[13px] text-txt-secondary text-center max-w-[46ch] mx-auto mb-6">
              {t("settings.domain_purchase_progress_note")}
            </p>
            <div className="space-y-0.5 w-fit mx-auto">
              {progress_steps.map((step, i) => {
                const done = i < step_index;
                const active = i === step_index;

                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-3 py-2.5"
                  >
                    {done ? (
                      <CheckCircleSolid className="w-6 h-6 text-green-500 flex-shrink-0" />
                    ) : active ? (
                      <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                        <Spinner
                          className="text-[var(--accent-color)]"
                          size="sm"
                        />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full border-2 border-edge-secondary flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        done
                          ? "text-txt-secondary"
                          : active
                            ? "font-semibold text-txt-primary"
                            : "text-txt-muted"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {slow && (
              <p className="text-xs text-txt-muted pt-4 text-center max-w-[46ch] mx-auto">
                {t("settings.domain_purchase_slow_note")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (view === "confirm" && selected) {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 mb-4 -ms-1.5 px-1.5 py-1 rounded-lg text-[13px] font-medium text-txt-secondary hover:text-txt-primary hover:bg-surf-secondary transition-colors"
          type="button"
          onClick={() => {
            set_view("search");
            set_error(null);
          }}
        >
          <ArrowLeftIcon className="w-4 h-4 rtl:-scale-x-100" />
          {t("common.back")}
        </button>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] md:grid-rows-[auto_auto_1fr] gap-x-6 gap-y-5 items-start">
          <div className="md:col-start-1 md:row-start-1">
            <div>
              <p className="text-sm font-medium mb-2 text-txt-primary">
                {t("settings.domain_purchase_years")}
              </p>
              <div className="flex gap-2">
                {[1, 2, 3].map((y) => (
                  <button
                    key={y}
                    className={`flex-1 h-10 rounded-full border text-sm transition-colors ${
                      years === y
                        ? "border-transparent text-[var(--accent-fg,#ffffff)] font-semibold bg-[var(--accent-color)]"
                        : "border-edge-secondary text-txt-secondary hover:bg-surf-secondary"
                    }`}
                    onClick={() => set_years(y)}
                  >
                    {y === 1
                      ? t("settings.domain_purchase_one_year")
                      : t("settings.domain_purchase_n_years", { count: y })}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium mb-2 text-txt-primary">
                {t("settings.domain_purchase_pay_with")}
              </p>
              <div className="flex gap-2">
                {(
                  [
                    [
                      "stripe",
                      CreditCardIcon,
                      t("settings.domain_purchase_pay_card"),
                    ],
                    [
                      "crypto",
                      CurrencyDollarIcon,
                      t("settings.domain_purchase_pay_crypto"),
                    ],
                  ] as const
                ).map(([method, Icon, label]) => (
                  <button
                    key={method}
                    className={`flex-1 h-10 rounded-full border text-sm flex items-center justify-center gap-2 transition-colors ${
                      payment_method === method
                        ? "border-transparent text-[var(--accent-fg,#ffffff)] font-semibold bg-[var(--accent-color)]"
                        : "border-edge-secondary text-txt-secondary hover:bg-surf-secondary"
                    }`}
                    onClick={() => set_payment_method(method)}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {turnstile_required && (
              <div className="flex justify-center mt-4 origin-top scale-[0.92] sm:scale-100">
                <TurnstileWidget
                  ref={turnstile_ref}
                  on_expire={() => set_captcha_token(null)}
                  on_verify={set_captcha_token}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 mt-4 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-txt-primary">{error}</p>
              </div>
            )}
          </div>

          <div className="order-3 md:order-none md:col-start-1 md:row-start-2">
            <div className="mt-2 md:mt-0">
              <p className="text-[13px] font-medium text-txt-muted mb-3">
                {t("settings.domain_purchase_included_heading")}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  t("settings.domain_purchase_detail_privacy_title"),
                  t("settings.domain_purchase_detail_setup_title"),
                  t("settings.domain_purchase_detail_instant_title"),
                  t("settings.domain_purchase_detail_ownership_title"),
                ].map((title) => (
                  <span key={title} className="flex items-center gap-2.5">
                    <CheckIcon
                      className="w-4 h-4 flex-shrink-0"
                      strokeWidth={2.5}
                      style={{ color: "var(--color-success)" }}
                    />
                    <span className="text-[13px] font-medium text-txt-primary">
                      {title}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="order-2 md:order-none md:col-start-2 md:row-start-1 md:row-span-3 md:sticky md:top-4">
            <img
              alt="Aster"
              className="h-6 w-auto mx-auto block mb-3.5 opacity-90"
              draggable={false}
              height={24}
              src="/text_logo.png"
              width={97}
            />

            <div className="rounded-2xl border border-edge-secondary bg-surf-secondary overflow-hidden">
              <div className="px-6 pt-5 pb-4 border-b border-edge-secondary">
                <p className="text-[11px] font-semibold tracking-wide uppercase text-txt-muted">
                  {t("settings.domain_purchase_order_summary")}
                </p>
                <p className="text-[17px] font-semibold text-txt-primary mt-2 break-all">
                  {selected.domain}
                </p>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-txt-secondary">
                    {t("settings.domain_purchase_years_line", { count: years })}
                  </span>
                  <span className="text-txt-primary font-medium flex-shrink-0">
                    {format_domain_price(selected_total, selected.currency)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-txt-secondary">
                    {t("settings.domain_purchase_summary_whois")}
                  </span>
                  <span className="text-txt-muted flex-shrink-0">
                    {t("settings.domain_purchase_summary_included")}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-txt-secondary">
                    {t("settings.domain_purchase_summary_dns")}
                  </span>
                  <span className="text-txt-muted flex-shrink-0">
                    {t("settings.domain_purchase_summary_included")}
                  </span>
                </div>
              </div>

              <div className="px-6 pt-5 pb-6 border-t border-edge-secondary">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-txt-primary">
                    {t("settings.domain_purchase_total_today")}
                  </span>
                  <span className="text-xl font-bold text-txt-primary flex-shrink-0">
                    {format_domain_price(selected_total, selected.currency)}
                  </span>
                </div>
                {selected.renewal_price_cents !== null && (
                  <p className="text-[12px] text-txt-muted mt-1.5 text-end">
                    {t("settings.domain_purchase_renews_at", {
                      price: format_domain_price(
                        selected.renewal_price_cents,
                        selected.currency,
                      ),
                    })}
                  </p>
                )}
                <Button
                  className="w-full mt-5"
                  disabled={buying || (turnstile_required && !captcha_token)}
                  variant="depth"
                  onClick={handle_buy}
                >
                  {buying ? (
                    <Spinner size="sm" />
                  ) : (
                    t("settings.domain_purchase_buy", {
                      price: format_domain_price(
                        selected_total,
                        selected.currency,
                      ),
                    })
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-3">
              <LockClosedIcon className="w-3 h-3 text-txt-muted flex-shrink-0" />
              <p className="text-[11px] leading-none text-txt-muted">
                {t("settings.domain_purchase_secure_checkout")}
              </p>
            </div>
          </div>

          <div className="order-4 md:order-none md:col-start-1 md:row-start-3 pt-4 border-t border-edge-secondary">
            <TermsSentence on_external={set_leave_url} />
          </div>
        </div>

        {leave_modal}
      </div>
    );
  }

  return (
    <div>
      <div>
        <div className="relative">
          <MagnifyingGlassIcon className="w-[18px] h-[18px] absolute start-4 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            autoFocus
            className="w-full h-12 ps-11 pe-11 rounded-xl bg-surf-secondary border border-edge-secondary text-[15px] text-txt-primary placeholder:text-txt-muted outline-none focus:border-[var(--accent-color)]/70 transition-colors"
            placeholder={t("settings.domain_purchase_search_placeholder")}
            value={query}
            onChange={(e) =>
              set_query(apply_input_transform(e.target, (v) => v.toLowerCase()))
            }
          />
          {searching && (
            <Spinner
              className="absolute end-4 top-1/2 -translate-y-1/2 text-txt-muted"
              size="sm"
            />
          )}
        </div>

        <div className={active_search ? "mt-3 min-h-[300px]" : ""}>
          {!active_search ? null : error ? (
            <div className="flex flex-col items-center justify-center text-center h-[280px]">
              {!unavailable && (
                <ExclamationTriangleIcon className="w-8 h-8 text-yellow-500 mb-3" />
              )}
              <p className="text-sm text-txt-secondary max-w-[300px] mb-4">
                {error}
              </p>
              {!unavailable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run_search(query)}
                >
                  <ArrowPathIcon className="w-4 h-4 me-1.5" />
                  {t("settings.domain_purchase_retry")}
                </Button>
              )}
            </div>
          ) : !has_rows ? (
            searching || !results_query ? (
              <SkeletonRows />
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-[280px]">
                <p className="text-sm text-txt-muted">
                  {t("settings.domain_purchase_no_results")}
                </p>
              </div>
            )
          ) : (
            <div
              className={`transition-opacity divide-y divide-edge-secondary/60 ${
                showing_stale ? "opacity-40" : "opacity-100"
              }`}
            >
              <div className="flex flex-col items-start gap-1 pt-4 pb-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 max-w-full">
                  <h3 className="text-[15px] font-semibold text-txt-primary truncate">
                    {t("settings.domain_purchase_results_for", {
                      name: results_query,
                    })}
                  </h3>
                </div>
                <button
                  className="flex-shrink-0 -mx-2 px-2 py-2 min-h-[40px] text-[13px] font-medium text-[var(--accent-color)] hover:underline"
                  onClick={() => {
                    set_query("");
                  }}
                >
                  {t("settings.domain_purchase_change_name")}
                </button>
              </div>
              <div className="pb-1">
                {results.length > 0 && filtered_results.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-txt-muted">
                    {t("settings.domain_purchase_no_results")}
                  </p>
                )}
                {best_match && (
                  <ResultRow
                    primary
                    on_select={(r) => {
                      set_selected(r);
                      set_error(null);
                      set_view("confirm");
                    }}
                    result={best_match}
                  />
                )}
                {rest_results.map((result) => (
                  <ResultRow
                    key={result.domain}
                    on_select={(r) => {
                      set_selected(r);
                      set_error(null);
                      set_view("confirm");
                    }}
                    result={result}
                  />
                ))}
                {filtered_results.length > visible_count && (
                  <div className="flex justify-center pt-2 pb-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => set_visible_count((c) => c + 10)}
                    >
                      {t("settings.domain_purchase_show_more")}
                    </Button>
                  </div>
                )}
              </div>
              {(suggestions.length > 0 || has_more_suggestions) &&
                active_tld === null && (
                  <div className="pt-2">
                    {suggestions.length > 0 && (
                      <p className="px-3 pt-2 pb-1.5 text-[12px] font-semibold uppercase tracking-wide text-txt-muted">
                        {t("settings.domain_purchase_try_instead")}
                      </p>
                    )}
                    {suggestions.map((result) => (
                      <ResultRow
                        key={result.domain}
                        on_select={(r) => {
                          set_selected(r);
                          set_error(null);
                          set_view("confirm");
                        }}
                        result={result}
                      />
                    ))}
                    {has_more_suggestions && (
                      <div className="flex justify-center pt-2 pb-1">
                        <Button
                          disabled={loading_more_suggestions}
                          size="sm"
                          variant="ghost"
                          onClick={load_more_suggestions}
                        >
                          {loading_more_suggestions ? (
                            <Spinner size="sm" />
                          ) : (
                            t("settings.domain_purchase_more_suggestions")
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {!active_search && (
        <div className="px-6 py-12 text-center">
          <p className="text-sm leading-relaxed text-txt-secondary max-w-[46ch] mx-auto">
            {t("settings.domain_purchase_empty_subtitle")}
          </p>
          <p className="text-xs leading-relaxed text-txt-muted mt-3 max-w-[52ch] mx-auto">
            {t("settings.domain_purchase_empty_included")}
          </p>
        </div>
      )}
      {leave_modal}
    </div>
  );
}
