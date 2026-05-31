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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import * as React from "react";
import {
  NoSymbolIcon,
  TrashIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { ConditionChip } from "@/components/mail_rules/condition_chip";
import { AddConditionChip } from "@/components/mail_rules/add_condition_chip";
import { AndOrPill } from "@/components/mail_rules/and_or_pill";
import { ChipPill, ChipSegment } from "@/components/mail_rules/chip_pill";
import {
  default_condition_for_field,
} from "@/components/mail_rules/field_kind";
import type {
  LeafCondition,
  MatchMode,
} from "@/services/api/mail_rules";
import {
  create_alias_rule,
  update_alias_rule,
  type AliasRule,
  type AliasRuleCondition,
  type AliasRuleField,
  type AliasRuleOperator,
  type AliasRuleActions,
} from "@/services/api/alias_rules";

function to_leaf(c: AliasRuleCondition): LeafCondition {
  const field = c.field === "all" ? "from" : c.field;
  const op = (c.operator === "equals" ? "is" : c.operator) as never;
  return { type: field, operator: op, value: c.value } as LeafCondition;
}

function from_leaf(leaf: LeafCondition): AliasRuleCondition {
  if ("value" in leaf && typeof leaf.value === "string") {
    const field = leaf.type as AliasRuleField;
    const valid_fields: AliasRuleField[] = ["from", "to", "subject", "all"];
    const safe_field: AliasRuleField = valid_fields.includes(field) ? field : "from";
    const op_raw = "operator" in leaf ? leaf.operator as string : "contains";
    const op: AliasRuleOperator =
      op_raw === "is" ? "equals"
      : op_raw === "does_not_contain" ? "contains"
      : op_raw === "is_not" ? "equals"
      : op_raw === "matches_domain" ? "contains"
      : op_raw === "is_empty" ? "contains"
      : (op_raw as AliasRuleOperator);
    return { field: safe_field, operator: op, value: leaf.value };
  }
  return { field: "from", operator: "contains", value: "" };
}

function default_leaf(): LeafCondition {
  return default_condition_for_field("from");
}

interface AliasRuleEditorModalProps {
  is_open: boolean;
  on_close: () => void;
  alias_id: string;
  rule?: AliasRule | null;
  on_saved: () => void;
}

export function AliasRuleEditorModal({
  is_open,
  on_close,
  alias_id,
  rule,
  on_saved,
}: AliasRuleEditorModalProps) {
  const { t } = use_i18n();
  const is_edit = !!rule;

  const [conditions, set_conditions] = React.useState<LeafCondition[]>([default_leaf()]);
  const [match_mode, set_match_mode] = React.useState<MatchMode>("all");
  const [has_all_field, set_has_all_field] = React.useState(false);
  const [actions, set_actions] = React.useState<AliasRuleActions>({});
  const [label_value, set_label_value] = React.useState("");
  const [saving, set_saving] = React.useState(false);

  React.useEffect(() => {
    if (!is_open) return;
    if (rule) {
      const all_cond = rule.conditions.find((c) => c.field === "all");
      set_has_all_field(!!all_cond);
      const leaves = rule.conditions
        .filter((c) => c.field !== "all")
        .map(to_leaf);
      set_conditions(leaves.length > 0 ? leaves : [default_leaf()]);
      set_match_mode("all");
      set_actions(rule.actions);
      set_label_value(rule.actions.label ?? "");
    } else {
      set_conditions([default_leaf()]);
      set_match_mode("all");
      set_has_all_field(false);
      set_actions({});
      set_label_value("");
    }
  }, [is_open, rule]);

  const update_condition = (index: number, leaf: LeafCondition) => {
    set_conditions((prev) => prev.map((c, i) => (i === index ? leaf : c)));
  };

  const remove_condition = (index: number) => {
    set_conditions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [default_leaf()];
    });
  };

  const add_condition = (field: Parameters<typeof default_condition_for_field>[0]) => {
    set_conditions((prev) => [...prev, default_condition_for_field(field)]);
  };

  const toggle_action = (key: "block" | "to_trash") => {
    set_actions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const has_action =
    !!actions.block || !!actions.to_trash || label_value.trim().length > 0;

  const handle_save = async () => {
    if (!has_action) {
      show_toast(t("settings.alias_rule_needs_action"), "error");
      return;
    }

    const alias_conditions: AliasRuleCondition[] = has_all_field
      ? [{ field: "all", operator: "contains", value: "" }]
      : conditions.map(from_leaf).filter(
          (c) => c.field === "all" || c.value.trim().length > 0,
        );

    if (alias_conditions.length === 0) {
      show_toast(t("settings.alias_rule_needs_condition"), "error");
      return;
    }

    const final_actions: AliasRuleActions = {};
    if (actions.block) final_actions.block = true;
    if (actions.to_trash) final_actions.to_trash = true;
    if (label_value.trim()) final_actions.label = label_value.trim();

    set_saving(true);
    try {
      const resp = is_edit && rule
        ? await update_alias_rule(alias_id, rule.id, {
            conditions: alias_conditions,
            actions: final_actions,
          })
        : await create_alias_rule(alias_id, {
            priority: 0,
            conditions: alias_conditions,
            actions: final_actions,
            is_enabled: true,
          });

      if (resp.error) {
        show_toast(resp.error, "error");
      } else {
        show_toast(
          is_edit ? t("settings.alias_rule_updated") : t("settings.alias_rule_added"),
          "success",
        );
        on_saved();
        on_close();
      }
    } finally {
      set_saving(false);
    }
  };

  return (
    <Modal close_on_overlay={false} is_open={is_open} size="2xl" on_close={on_close}>
      <ModalHeader>
        <ModalTitle>
          {is_edit ? t("settings.alias_rule_edit_title") : t("settings.alias_rule_new_title")}
        </ModalTitle>
        <ModalDescription>
          {t("settings.alias_rules_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-txt-muted">
              {t("settings.alias_rule_when")}
            </p>
            {!has_all_field && conditions.length > 1 && (
              <AndOrPill
                mode={match_mode}
                on_change={set_match_mode}
              />
            )}
          </div>

          {has_all_field ? (
            <div className="flex items-center gap-2">
              <ChipPill on_remove={() => set_has_all_field(false)}>
                <ChipSegment is_first is_last>
                  {t("settings.alias_rule_field_all")}
                </ChipSegment>
              </ChipPill>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {conditions.map((cond, idx) => (
                <ConditionChip
                  key={idx}
                  condition={cond}
                  on_change={(next) => update_condition(idx, next)}
                  on_remove={() => remove_condition(idx)}
                />
              ))}
              <AddConditionChip on_pick={add_condition} />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-txt-muted hover:text-txt-primary"
                onClick={() => {
                  set_has_all_field(true);
                  set_conditions([default_leaf()]);
                }}
              >
                {t("settings.alias_rule_match_all_emails")}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-txt-muted">
            {t("settings.alias_rule_then")}
          </p>
          <div className="flex flex-wrap gap-2">
            <ChipPill on_remove={actions.block ? () => toggle_action("block") : undefined}>
              <ChipSegment
                is_first
                is_last={!actions.block}
                icon={<NoSymbolIcon className="w-3 h-3" />}
                on_click={() => toggle_action("block")}
                is_active={!!actions.block}
              >
                {t("settings.alias_rule_action_block")}
              </ChipSegment>
            </ChipPill>

            <ChipPill on_remove={actions.to_trash ? () => toggle_action("to_trash") : undefined}>
              <ChipSegment
                is_first
                is_last={!actions.to_trash}
                icon={<TrashIcon className="w-3 h-3" />}
                on_click={() => toggle_action("to_trash")}
                is_active={!!actions.to_trash}
              >
                {t("settings.alias_rule_action_to_trash")}
              </ChipSegment>
            </ChipPill>

            <ChipPill>
              <ChipSegment
                is_first
                icon={<TagIcon className="w-3 h-3" />}
                is_active={label_value.trim().length > 0}
              >
                {t("settings.alias_rule_action_label")}
              </ChipSegment>
              <ChipSegment is_last>
                <input
                  className="bg-transparent outline-none text-sm text-txt-primary placeholder:text-txt-muted w-28 min-w-0"
                  placeholder={t("settings.alias_rule_action_label_placeholder")}
                  value={label_value}
                  onChange={(e) => set_label_value(e.target.value)}
                />
              </ChipSegment>
            </ChipPill>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button disabled={saving} variant="ghost" onClick={on_close}>
          {t("settings.alias_rule_cancel")}
        </Button>
        <Button
          disabled={!has_action || saving}
          variant="depth"
          onClick={handle_save}
        >
          {saving && <Spinner size="xs" />}
          {is_edit ? t("settings.alias_rule_save_changes") : t("settings.alias_rule_save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
