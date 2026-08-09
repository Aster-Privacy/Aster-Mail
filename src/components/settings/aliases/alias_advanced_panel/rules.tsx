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
import type { } from "@/services/api/aliases";
import type { } from "@/lib/i18n/types";

import { useCallback, useEffect,  useState } from "react";
import {
  TrashIcon,
  PlusIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";


import { AliasRuleEditorModal } from "@/components/settings/aliases/alias_rule_editor_modal";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import {
  list_alias_rules,
  update_alias_rule,
  delete_alias_rule,
  list_domain_address_rules,
  update_domain_address_rule,
  delete_domain_address_rule,
  type AliasRule,
  type AliasRuleCondition,
  type AliasRuleField,
  type AliasRuleOperator,
  type AliasRuleActions,
} from "@/services/api/alias_rules";

export function field_label(
  t: ReturnType<typeof use_i18n>["t"],
  field: AliasRuleField,
) {
  switch (field) {
    case "all":
      return t("settings.alias_rule_field_all");
    case "from":
      return t("settings.alias_rule_field_from");
    case "to":
      return t("settings.alias_rule_field_to");
    case "subject":
      return t("settings.alias_rule_field_subject");
  }
}

export function operator_label(
  t: ReturnType<typeof use_i18n>["t"],
  operator: AliasRuleOperator,
) {
  switch (operator) {
    case "contains":
      return t("settings.alias_rule_op_contains");
    case "equals":
      return t("settings.alias_rule_op_equals");
    case "starts_with":
      return t("settings.alias_rule_op_starts_with");
    case "ends_with":
      return t("settings.alias_rule_op_ends_with");
    case "matches_regex":
      return t("settings.alias_rule_op_matches_regex");
    default:
      return operator;
  }
}

export function RulesPanel({
  alias_id,
  domain_address_id,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [rules, set_rules] = useState<AliasRule[]>([]);
  const [loading, set_loading] = useState(true);
  const [modal_open, set_modal_open] = useState(false);
  const [editing_rule, set_editing_rule] = useState<AliasRule | null>(null);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
    set_loading(true);
    try {
      const response = domain_address_id
        ? await list_domain_address_rules(domain_address_id)
        : await list_alias_rules(alias_id!);

      if (response.data) set_rules(response.data.rules ?? []);
    } catch {
      set_rules([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, domain_address_id, locked]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_toggle = async (rule: AliasRule) => {
    const next = !rule.is_enabled;

    set_rules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: next } : r)),
    );
    const response = domain_address_id
      ? await update_domain_address_rule(domain_address_id, rule.id, {
          is_enabled: next,
        })
      : await update_alias_rule(alias_id!, rule.id, { is_enabled: next });

    if (response.error) {
      set_rules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_enabled: rule.is_enabled } : r,
        ),
      );
      show_toast(response.error, "error");
    }
  };

  const handle_delete = async (rule_id: string) => {
    const response = domain_address_id
      ? await delete_domain_address_rule(domain_address_id, rule_id)
      : await delete_alias_rule(alias_id!, rule_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_rule_removed"), "success");
      set_rules((prev) => prev.filter((r) => r.id !== rule_id));
    }
  };

  const describe_conditions = (conditions: AliasRuleCondition[]) =>
    conditions
      .map((c) =>
        c.field === "all"
          ? t("settings.alias_rule_field_all")
          : `${field_label(t, c.field)} ${operator_label(t, c.operator)} "${c.value}"`,
      )
      .join(" · ");

  const describe_actions = (a: AliasRuleActions): string => {
    const parts: string[] = [];

    if (a.block) parts.push(t("settings.alias_rule_action_block"));
    if (a.to_trash) parts.push(t("settings.alias_rule_action_to_trash"));
    if (a.label)
      parts.push(`${t("settings.alias_rule_action_label")}: ${a.label}`);

    return parts.join(", ");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-sm text-txt-primary">
            {t("settings.alias_rules_title")}
          </p>
          <InfoHint
            tip={t("settings.alias_rules_info")}
            title={t("settings.alias_rules_title")}
          />
        </div>
        <Button
          className="shrink-0"
          size="sm"
          variant="depth"
          onClick={() => {
            set_editing_rule(null);
            set_modal_open(true);
          }}
        >
          <PlusIcon className="w-4 h-4" />
          {t("settings.alias_rule_add")}
        </Button>
      </div>

      {loading ? (
        <Spinner size="md" />
      ) : rules.length === 0 ? (
        <p className="text-xs text-txt-muted">
          {t("settings.alias_rules_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-txt-primary">
                  {describe_conditions(rule.conditions)}
                </p>
                <p className="text-xs text-txt-muted truncate">
                  {describe_actions(rule.actions)}
                </p>
              </div>
              <Switch
                checked={rule.is_enabled}
                size="lg"
                onCheckedChange={() => handle_toggle(rule)}
              />
              <Button
                className="h-7 w-7"
                size="icon"
                variant="ghost"
                onClick={() => {
                  set_editing_rule(rule);
                  set_modal_open(true);
                }}
              >
                <PencilSquareIcon className="w-4 h-4 text-txt-muted" />
              </Button>
              <Button
                className="h-7 w-7 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                size="icon"
                variant="ghost"
                onClick={() => handle_delete(rule.id)}
              >
                <TrashIcon className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AliasRuleEditorModal
        alias_id={alias_id}
        domain_address_id={domain_address_id}
        is_open={modal_open}
        on_close={() => set_modal_open(false)}
        on_saved={load}
        rule={editing_rule}
      />
    </div>
  );
}

