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
import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_forwarding_rules,
  create_forwarding_rule,
  update_forwarding_rule,
  delete_forwarding_rule,
  toggle_forwarding_rule,
  resend_forwarding_confirmation,
  type ForwardingRuleResponse,
  type ForwardingCondition,
  type ForwardingDestinationStatus,
} from "@/services/api/auto_forward";
import { ForwardingRuleBuilder } from "@/components/settings/forwarding_rule_builder";

import { ignore_error } from "@/lib/ignore_error";

export function AutoForwardTab() {
  const { t } = use_i18n();
  const [rules, set_rules] = useState<ForwardingRuleResponse[]>([]);
  const [rules_loading, set_rules_loading] = useState(true);
  const [show_rule_builder, set_show_rule_builder] = useState(false);
  const [editing_rule, set_editing_rule] =
    useState<ForwardingRuleResponse | null>(null);
  const [is_saving_rule, set_is_saving_rule] = useState(false);
  const [is_deleting_rule, set_is_deleting_rule] = useState(false);
  const [resending_address, set_resending_address] = useState<string | null>(
    null,
  );

  const pending_destinations = useCallback(
    (rule: ForwardingRuleResponse): ForwardingDestinationStatus[] =>
      (rule.destinations ?? []).filter((d) => !d.confirmed),
    [],
  );

  const notify_saved = useCallback(
    (rule: ForwardingRuleResponse, created: boolean) => {
      const pending = pending_destinations(rule);

      if (pending.length > 0) {
        show_toast(
          t("settings.forwarding_verification_sent", {
            address: pending.map((d) => d.address).join(", "),
          }),
          "success",
        );

        return;
      }

      const destinations = rule.destinations ?? [];

      if (destinations.length > 0 && destinations.every((d) => d.is_internal)) {
        show_toast(t("settings.forwarding_internal_active"), "success");

        return;
      }

      show_toast(
        created
          ? t("common.forwarding_rule_created")
          : t("common.forwarding_rule_updated"),
        "success",
      );
    },
    [pending_destinations, t],
  );

  const handle_resend = useCallback(
    async (rule: ForwardingRuleResponse, address: string) => {
      set_resending_address(address);
      try {
        const result = await resend_forwarding_confirmation(rule.id, address);

        if (result.data?.success) {
          show_toast(
            t("settings.forwarding_verification_resent", { address }),
            "success",
          );
        } else if (result.error) {
          show_toast(result.error, "error");
        }
      } finally {
        set_resending_address(null);
      }
    },
    [t],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirmed = params.get("forwarding_confirmed");

    if (confirmed === null) return;

    show_toast(
      confirmed === "true"
        ? t("settings.forwarding_confirmed_success")
        : t("settings.forwarding_confirmed_failed"),
      confirmed === "true" ? "success" : "error",
    );

    params.delete("forwarding_confirmed");
    const query = params.toString();

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function load_rules() {
      try {
        const result = await list_forwarding_rules();

        if (cancelled) return;
        if (result.data) set_rules(result.data);
      } catch (caught) {
        ignore_error(
          "pages/mobile/settings/auto_forward_tab:load_rules",
          caught,
        );
      } finally {
        if (!cancelled) set_rules_loading(false);
      }
    }
    load_rules();

    return () => {
      cancelled = true;
    };
  }, []);

  const handle_toggle_rule = useCallback(
    async (rule: ForwardingRuleResponse) => {
      const new_enabled = !rule.is_enabled;

      set_rules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_enabled: new_enabled } : r,
        ),
      );
      try {
        const result = await toggle_forwarding_rule(rule.id, new_enabled);

        if (result.error) {
          set_rules((prev) =>
            prev.map((r) =>
              r.id === rule.id ? { ...r, is_enabled: !new_enabled } : r,
            ),
          );
          show_toast(t("common.failed_to_update_rule"), "error");
        }
      } catch {
        set_rules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, is_enabled: !new_enabled } : r,
          ),
        );
      }
    },
    [t],
  );

  const handle_delete_rule = useCallback(
    async (rule: ForwardingRuleResponse) => {
      set_is_deleting_rule(true);
      try {
        const result = await delete_forwarding_rule(rule.id);

        if (result.data?.success) {
          set_rules((prev) => prev.filter((r) => r.id !== rule.id));
          show_toast(
            t("settings.removed_forwarding_rule", { name: rule.name }),
            "success",
          );
        }
      } finally {
        set_is_deleting_rule(false);
      }
    },
    [t],
  );

  const handle_save_rule = useCallback(
    async (
      name: string,
      forward_to: string[],
      conditions: ForwardingCondition[],
      keep_copy: boolean,
    ) => {
      set_is_saving_rule(true);
      try {
        if (editing_rule) {
          const result = await update_forwarding_rule(
            editing_rule.id,
            name,
            forward_to,
            conditions,
            keep_copy,
          );

          if (result.data) {
            set_rules((prev) =>
              prev.map((r) => (r.id === editing_rule.id ? result.data! : r)),
            );
            notify_saved(result.data, false);
            set_show_rule_builder(false);
            set_editing_rule(null);
          } else if (result.error) {
            show_toast(result.error, "error");
          }
        } else {
          const result = await create_forwarding_rule(
            name,
            forward_to,
            conditions,
            keep_copy,
          );

          if (result.data) {
            set_rules((prev) => [result.data!, ...prev]);
            notify_saved(result.data, true);
            set_show_rule_builder(false);
            set_editing_rule(null);
          } else if (result.error) {
            show_toast(result.error, "error");
          }
        }
      } finally {
        set_is_saving_rule(false);
      }
    },
    [editing_rule, notify_saved],
  );

  const get_condition_summary = useCallback(
    (conditions: ForwardingCondition[]): string => {
      if (
        conditions.length === 0 ||
        conditions.some((c) => c.field === "all")
      ) {
        return t("settings.all_emails_filter");
      }

      return conditions
        .map((c) => `${c.field} ${c.operator.replace("_", " ")} "${c.value}"`)
        .join(" & ");
    },
    [t],
  );

  const format_rule_date = useCallback((date_string: string) => {
    return new Date(date_string).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <>
      <div className="px-4 pt-3">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[16px] py-3 text-[14px] font-semibold text-white"
          style={{
            background:
              "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
            boxShadow:
              "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
          type="button"
          onClick={() => {
            set_editing_rule(null);
            set_show_rule_builder(true);
          }}
        >
          <PlusIcon className="h-4 w-4" />
          {t("settings.add_rule")}
        </button>
      </div>

      {rules_loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-8 pt-12">
          <ArrowTopRightOnSquareIcon className="h-16 w-16 text-[var(--mobile-text-muted)] opacity-40" />
          <p className="text-center text-[14px] text-[var(--mobile-text-muted)]">
            {t("settings.no_forwarding_rules")}
          </p>
          <p className="text-center text-[12px] text-[var(--mobile-text-muted)]">
            {t("settings.auto_forward_description")}
          </p>
        </div>
      ) : (
        <div className="px-4 pt-3 space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-2xl bg-[var(--mobile-bg-card)] overflow-hidden"
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: rule.is_enabled
                      ? "color-mix(in srgb, var(--mobile-accent) 15%, transparent)"
                      : "var(--mobile-bg-card-hover)",
                  }}
                >
                  <ArrowTopRightOnSquareIcon
                    className="w-4.5 h-4.5"
                    style={{
                      color: rule.is_enabled
                        ? "var(--mobile-accent)"
                        : "var(--mobile-text-muted)",
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-medium text-[var(--mobile-text-primary)]">
                      {rule.name}
                    </p>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        backgroundColor: rule.is_enabled
                          ? "rgba(34, 197, 94, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                        color: rule.is_enabled
                          ? "rgb(34, 197, 94)"
                          : "rgb(245, 158, 11)",
                      }}
                    >
                      {rule.is_enabled
                        ? t("common.active")
                        : t("common.paused")}
                    </span>
                    {rule.keep_copy && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--accent-color) 15%, transparent)",
                          color: "rgb(59, 130, 246)",
                        }}
                      >
                        {t("settings.keeps_copy")}
                      </span>
                    )}
                    {pending_destinations(rule).length > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          color: "rgb(245, 158, 11)",
                        }}
                      >
                        {t("settings.forwarding_pending_verification")}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--mobile-text-muted)] truncate mt-0.5">
                    {get_condition_summary(rule.conditions)} →{" "}
                    {rule.forward_to.join(", ")}
                  </p>
                  {pending_destinations(rule).length > 0 && (
                    <div className="mt-1">
                      <p
                        className="text-[11px]"
                        style={{ color: "rgb(245, 158, 11)" }}
                      >
                        {t("settings.forwarding_awaiting_verification", {
                          addresses: pending_destinations(rule)
                            .map((d) => d.address)
                            .join(", "),
                        })}
                      </p>
                      {pending_destinations(rule).map((destination) => (
                        <button
                          key={destination.address}
                          className="mt-1 text-[11px] font-medium underline disabled:opacity-50"
                          disabled={resending_address === destination.address}
                          style={{ color: "var(--mobile-accent)" }}
                          type="button"
                          onClick={() =>
                            handle_resend(rule, destination.address)
                          }
                        >
                          {t("settings.resend_verification_email")}
                        </button>
                      ))}
                    </div>
                  )}
                  {rule.forwarded_count > 0 && (
                    <p className="text-[11px] text-[var(--mobile-text-muted)] mt-0.5">
                      {t("mail.forwarded_count", {
                        count: rule.forwarded_count,
                      })}
                      {rule.last_forwarded_at &&
                        ` · ${format_rule_date(rule.last_forwarded_at)}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="px-4 py-2.5 border-t border-[var(--mobile-border)] flex gap-2">
                <button
                  className="flex-1 rounded-[14px] py-2 text-[13px] font-medium text-[var(--mobile-text-secondary)] bg-[var(--mobile-bg-card-hover)]"
                  type="button"
                  onClick={() => {
                    set_editing_rule(rule);
                    set_show_rule_builder(true);
                  }}
                >
                  {t("common.edit")}
                </button>
                <button
                  className="flex-1 rounded-[14px] py-2 text-[13px] font-medium text-[var(--mobile-text-secondary)] bg-[var(--mobile-bg-card-hover)]"
                  type="button"
                  onClick={() => handle_toggle_rule(rule)}
                >
                  {rule.is_enabled ? t("common.paused") : t("common.enable")}
                </button>
                <button
                  className="rounded-[14px] px-3 py-2 text-[13px] font-medium text-[var(--mobile-danger)] bg-[var(--mobile-bg-card-hover)] disabled:opacity-50"
                  disabled={is_deleting_rule}
                  type="button"
                  onClick={() => handle_delete_rule(rule)}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {show_rule_builder && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => {
            set_show_rule_builder(false);
            set_editing_rule(null);
          }}
        >
          <motion.div
            animate={{ y: 0 }}
            className="w-full max-w-lg rounded-t-3xl bg-[var(--mobile-bg-card)] px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--mobile-text-muted)] opacity-30" />
            <h3 className="text-[17px] font-semibold text-[var(--mobile-text-primary)] mb-4">
              {editing_rule
                ? t("settings.edit_forwarding_rule")
                : t("settings.create_forwarding_rule")}
            </h3>
            <ForwardingRuleBuilder
              initial_conditions={editing_rule?.conditions}
              initial_forward_to={editing_rule?.forward_to}
              initial_keep_copy={editing_rule?.keep_copy}
              initial_name={editing_rule?.name}
              is_saving={is_saving_rule}
              on_cancel={() => {
                set_show_rule_builder(false);
                set_editing_rule(null);
              }}
              on_save={handle_save_rule}
            />
          </motion.div>
        </div>
      )}
    </>
  );
}
