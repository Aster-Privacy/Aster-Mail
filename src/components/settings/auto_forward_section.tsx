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
import { useState, useEffect, useCallback } from "react";
import {
  ArrowTopRightOnSquareIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { ForwardingRuleBuilder } from "./forwarding_rule_builder";

import { use_i18n } from "@/lib/i18n/context";
import { use_shift_range_select } from "@/lib/use_shift_range_select";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  list_forwarding_rules,
  create_forwarding_rule,
  update_forwarding_rule,
  delete_forwarding_rule,
  bulk_delete_forwarding_rules,
  toggle_forwarding_rule,
  type ForwardingRuleResponse,
  type ForwardingCondition,
} from "@/services/api/auto_forward";
import { get_favicon_url } from "@/lib/favicon_url";
import { show_toast } from "@/components/toast/simple_toast";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";

export function AutoForwardSection() {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const [rules, set_rules] = useState<ForwardingRuleResponse[]>([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_loading, set_is_loading] = useState(true);
  const [is_deleting, set_is_deleting] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [show_builder, set_show_builder] = useState(false);
  const [editing_rule, set_editing_rule] =
    useState<ForwardingRuleResponse | null>(null);
  const [is_saving, set_is_saving] = useState(false);
  const [form_visible, set_form_visible] = useState(false);

  const open_builder = (rule?: ForwardingRuleResponse) => {
    set_editing_rule(rule ?? null);
    set_show_builder(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set_form_visible(true);
      });
    });
  };

  const close_builder = () => {
    set_form_visible(false);
    setTimeout(() => {
      set_show_builder(false);
      set_editing_rule(null);
    }, 200);
  };

  const fetch_rules = useCallback(async () => {
    try {
      const result = await list_forwarding_rules();

      if (result.data) {
        set_rules(result.data);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    fetch_rules();
  }, [fetch_rules]);

  const filtered_rules = rules.filter((rule) => {
    if (!search_query) return true;
    const query = search_query.toLowerCase();

    return (
      rule.name.toLowerCase().includes(query) ||
      rule.forward_to.some((email) => email.toLowerCase().includes(query))
    );
  });

  const handle_select = use_shift_range_select(
    filtered_rules,
    (rule) => rule.id,
    selected_ids,
    set_selected_ids,
  );

  const handle_select_all = () => {
    if (selected_ids.size === filtered_rules.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(filtered_rules.map((r) => r.id)));
    }
  };

  const handle_delete = async (rule: ForwardingRuleResponse) => {
    set_is_deleting(true);
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
      set_is_deleting(false);
    }
  };

  const handle_bulk_delete = async () => {
    if (selected_ids.size === 0) return;

    set_is_deleting(true);
    try {
      const ids = Array.from(selected_ids);
      const result = await bulk_delete_forwarding_rules(ids);

      if (result.data?.success) {
        set_rules((prev) => prev.filter((r) => !selected_ids.has(r.id)));
        show_toast(
          t("settings.removed_forwarding_rules_count", {
            count: String(result.data.deleted_count),
          }),
          "success",
        );
        set_selected_ids(new Set());
      }
    } finally {
      set_is_deleting(false);
    }
  };

  const handle_toggle = async (rule: ForwardingRuleResponse) => {
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
  };

  const handle_save_rule = async (
    name: string,
    forward_to: string[],
    conditions: ForwardingCondition[],
    keep_copy: boolean,
  ) => {
    set_is_saving(true);
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
          show_toast(t("common.forwarding_rule_updated"), "success");
          close_builder();
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
          show_toast(t("common.forwarding_rule_created"), "success");
          close_builder();
        } else if (result.error) {
          show_toast(result.error, "error");
        }
      }
    } finally {
      set_is_saving(false);
    }
  };

  const get_condition_summary = (conditions: ForwardingCondition[]): string => {
    if (conditions.length === 0 || conditions.some((c) => c.field === "all")) {
      return t("settings.all_emails_filter");
    }

    return conditions
      .map((c) => `${c.field} ${c.operator.replace("_", " ")} "${c.value}"`)
      .join(" AND ");
  };

  const format_date = (date_string: string) => {
    const date = new Date(date_string);

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const format_count = (count: number): string => {
    if (count === 0) return "";
    if (count >= 1000) return t("mail.forwarded_count_k", { count: (count / 1000).toFixed(1) });

    return t("mail.forwarded_count", { count });
  };

  const get_forward_favicon_url = (forward_to: string[]): string | null => {
    const first_email = forward_to[0];

    if (!first_email || !first_email.includes("@")) return null;
    const domain = first_email.split("@")[1];

    if (!domain) return null;

    return get_favicon_url(domain);
  };

  if (is_loading) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <UpgradeGate
      description={t("settings.auto_forward_locked")}
      feature_name={t("settings.auto_forward_title")}
      is_locked={is_feature_locked("has_auto_forwarding")}
      min_plan="Star"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-txt-primary">
              {t("settings.auto_forward_title")}
            </h3>
            <Button className="gap-2" size="md" onClick={() => open_builder()}>
              <PlusIcon className="w-4 h-4" />
              {t("settings.add_rule")}
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
          <p className="text-sm mt-3 text-txt-muted">
            {t("settings.auto_forward_description")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
            <Input
              className="!pl-9"
              placeholder={t("common.search_forwarding_rules")}
              size="md"
              value={search_query}
              onChange={(e) => set_search_query(e.target.value)}
            />
          </div>
          {selected_ids.size > 0 && (
            <Button
              className="gap-2"
              disabled={is_deleting}
              size="md"
              variant="destructive"
              onClick={handle_bulk_delete}
            >
              {is_deleting ? (
                <Spinner size="md" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
              {t("common.remove")} ({selected_ids.size})
            </Button>
          )}
        </div>

        {show_builder && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{
              opacity: form_visible ? 1 : 0,
              transition: "opacity 200ms",
            }}
          >
            <div
              className="absolute inset-0 backdrop-blur-md"
              style={{ backgroundColor: "var(--modal-overlay)" }}
              onClick={close_builder}
            />
            <div
              className="relative w-full max-w-lg mx-4 rounded-xl border p-6 shadow-xl transition-all duration-200 max-h-[85vh] overflow-y-auto bg-modal-bg border-edge-primary"
              style={{
                transform: form_visible
                  ? "scale(1) translateY(0)"
                  : "scale(0.97) translateY(4px)",
                opacity: form_visible ? 1 : 0,
              }}
            >
              <h4 className="text-[15px] font-semibold mb-5 text-txt-primary">
                {editing_rule
                  ? t("settings.edit_forwarding_rule")
                  : t("settings.create_forwarding_rule")}
              </h4>

              <ForwardingRuleBuilder
                initial_conditions={editing_rule?.conditions}
                initial_forward_to={editing_rule?.forward_to}
                initial_keep_copy={editing_rule?.keep_copy}
                initial_name={editing_rule?.name}
                is_saving={is_saving}
                on_cancel={close_builder}
                on_save={handle_save_rule}
              />
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
            <ArrowTopRightOnSquareIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-muted">
              {t("settings.no_forwarding_rules")}
            </p>
          </div>
        ) : filtered_rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-lg border bg-surf-tertiary border-edge-secondary">
            <p className="text-[14px] font-medium text-txt-primary">
              {t("common.no_results")}
            </p>
            <p className="text-[13px] mt-1 text-txt-muted">
              {t("settings.try_different_search")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-edge-secondary">
            <div className="flex items-center px-4 py-2 border-b border-edge-secondary">
              <Checkbox
                checked={selected_ids.size === filtered_rules.length}
                onCheckedChange={handle_select_all}
              />
              <span className="ml-3 text-xs font-medium text-txt-muted">
                {t("settings.forwarding_rules_count", {
                  count: String(filtered_rules.length),
                })}
              </span>
            </div>
            {filtered_rules.map((rule, index) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surf-hover"
                style={{
                  borderTop:
                    index > 0 ? "1px solid var(--border-secondary)" : "none",
                }}
              >
                <Checkbox
                  checked={selected_ids.has(rule.id)}
                  onCheckedChange={() => handle_select(index)}
                />

                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{
                    backgroundColor: rule.is_enabled
                      ? "var(--accent-blue-muted)"
                      : "var(--bg-tertiary)",
                  }}
                >
                  {get_forward_favicon_url(rule.forward_to) ? (
                    <img
                      alt=""
                      className="w-5 h-5 rounded-full"
                      src={get_forward_favicon_url(rule.forward_to)!}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove(
                          "hidden",
                        );
                      }}
                    />
                  ) : null}
                  <ArrowTopRightOnSquareIcon
                    className={`w-4 h-4 ${get_forward_favicon_url(rule.forward_to) ? "hidden" : ""}`}
                    style={{
                      color: rule.is_enabled
                        ? "var(--accent-blue)"
                        : "var(--text-muted)",
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate text-txt-primary">
                      {rule.name}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 font-medium"
                      style={{
                        backgroundColor: rule.is_enabled
                          ? "#16a34a"
                          : "#d97706",
                        color: "#fff",
                      }}
                    >
                      {rule.is_enabled
                        ? t("common.active")
                        : t("common.paused")}
                    </span>
                    {rule.keep_copy && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 font-medium"
                        style={{
                          backgroundColor: "#2563eb",
                          color: "#fff",
                        }}
                      >
                        {t("settings.keeps_copy")}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] truncate text-txt-muted">
                    {get_condition_summary(rule.conditions)}
                    {" → "}
                    {rule.forward_to.join(", ")}
                  </p>
                  {(rule.forwarded_count > 0 || rule.last_forwarded_at) && (
                    <p className="text-[11px] mt-0.5 text-txt-muted">
                      {format_count(rule.forwarded_count)}
                      {rule.last_forwarded_at &&
                        ` · ${t("mail.last_forwarded", { date: format_date(rule.last_forwarded_at) })}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] mr-1 text-txt-muted">
                    {format_date(rule.created_at)}
                  </span>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => open_builder(rule)}
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => handle_toggle(rule)}
                  >
                    {rule.is_enabled ? t("common.paused") : t("common.enable")}
                  </Button>
                  <Button
                    disabled={is_deleting}
                    size="md"
                    variant="destructive"
                    onClick={() => handle_delete(rule)}
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UpgradeGate>
  );
}
