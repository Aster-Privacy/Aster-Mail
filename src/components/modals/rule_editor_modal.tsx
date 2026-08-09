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
import * as React from "react";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { decrypt_aliases, list_all_aliases } from "@/services/api/aliases";
import type { AliasDeliverySetting } from "@/lib/alias_rule_delivery";
import {
  rule_alias_delivery_conflict,
  rule_alias_label_conflict,
} from "@/lib/alias_rule_delivery";
import {
  create_rule,
  update_rule,
  delete_rule,
  run_on_existing,
  refresh_run,
  cancel_run,
  use_mail_rules_store,
} from "@/stores/mail_rules_store";
import { ConditionChip } from "@/components/mail_rules/condition_chip";
import type { ChipSegmentKind } from "@/components/mail_rules/condition_chip";
import { AddConditionChip } from "@/components/mail_rules/add_condition_chip";
import { AndOrPill } from "@/components/mail_rules/and_or_pill";
import { ActionChip } from "@/components/mail_rules/action_chip";
import {
  AddActionChip,
  type AddableActionOption,
  type AddableActionType,
} from "@/components/mail_rules/add_action_chip";
import { field_kind } from "@/components/mail_rules/field_kind";
import type {
  Action,
  Condition,
  ConditionField,
  LeafCondition,
  MatchMode,
  Rule,
} from "@/services/api/mail_rules";
import { find_regex_condition_error } from "@/services/api/mail_rules";
import type { RuleEditorSeed } from "@/components/mail_rules/rule_templates";
import {
  parse as parse_expression,
  serialize as serialize_expression,
  friendly_error,
} from "@/lib/mail_rules/expression_parser";

import {
  ACTION_LABEL_KEYS,
  ADDABLE_ACTION_TYPES,
  RULE_COLORS,
  UNAVAILABLE_ACTION_TYPES,
  condition_has_value,
  default_action_for_type,
  default_condition,
  flatten_leaves,
  has_any_action_value,
  has_nested_logic,
  strip_unavailable_actions,
} from "@/components/modals/rule_editor_helpers";
import type { EditorTab } from "@/components/modals/rule_editor_helpers";

interface RuleEditorModalProps {
  is_open: boolean;
  on_close: () => void;
  rule?: Rule | null;
  seed?: RuleEditorSeed | null;
}

export function RuleEditorModal({
  is_open,
  on_close,
  rule,
  seed,
}: RuleEditorModalProps) {
  const { t } = use_i18n();
  const { state: folders_state, fetch_folders } = use_folders();
  const { state: tags_state, fetch_tags } = use_tags();
  const [alias_delivery, set_alias_delivery] = React.useState<
    Map<string, AliasDeliverySetting>
  >(new Map());

  const is_edit = !!rule;

  const [name, set_name] = React.useState("");
  const [color, set_color] = React.useState(RULE_COLORS[0]);
  const [match_mode, set_match_mode] = React.useState<MatchMode>("all");
  const [conditions, set_conditions] = React.useState<Condition[]>([]);
  const [new_indices, set_new_indices] = React.useState<Set<number>>(new Set());
  const [pending_blank_open, set_pending_blank_open] = React.useState(false);
  const [actions, set_actions] = React.useState<Action[]>([]);
  const [auto_open_index, set_auto_open_index] = React.useState<number | null>(
    null,
  );
  const [auto_open_segment, set_auto_open_segment] =
    React.useState<ChipSegmentKind>(null);
  const [saving, set_saving] = React.useState(false);
  const [confirm_delete_open, set_confirm_delete_open] = React.useState(false);
  const [running_existing, set_running_existing] = React.useState(false);
  const { runs } = use_mail_rules_store();
  const active_run = rule ? runs[rule.id] : undefined;
  const run_in_flight =
    active_run?.status === "pending" || active_run?.status === "running";
  const [tab, set_tab] = React.useState<EditorTab>("visual");
  const [expression_text, set_expression_text] = React.useState("");
  const [expression_error, set_expression_error] = React.useState<{
    message: string;
    line: number;
    col: number;
  } | null>(null);

  React.useEffect(() => {
    if (!is_open) return;
    if (folders_state.folders.length === 0 && !folders_state.is_loading) {
      fetch_folders();
    }
    if (tags_state.tags.length === 0 && !tags_state.is_loading) {
      fetch_tags();
    }
  }, [is_open]);

  React.useEffect(() => {
    if (!is_open) return;
    if (rule) {
      set_name(rule.name);
      set_color(rule.color || RULE_COLORS[0]);
      set_match_mode(rule.match_mode);
      set_conditions(rule.conditions);
      set_actions(strip_unavailable_actions(rule.actions));
      if (rule.expression) {
        set_expression_text(rule.expression);
        set_tab("expression");
      } else {
        const nested = has_nested_logic(rule.conditions);
        if (nested) {
          const synthetic: Condition =
            rule.match_mode === "any"
              ? { type: "or", conditions: rule.conditions }
              : { type: "and", conditions: rule.conditions };
          set_expression_text(serialize_expression(synthetic));
          set_tab("expression");
        } else {
          set_expression_text("");
          set_tab("visual");
        }
      }
    } else if (seed) {
      set_name(seed.name);
      set_color(seed.color || RULE_COLORS[0]);
      set_match_mode(seed.match_mode);
      set_conditions(seed.conditions);
      set_actions(strip_unavailable_actions(seed.actions));
      const nested = has_nested_logic(seed.conditions);
      if (nested) {
        const synthetic: Condition =
          seed.match_mode === "any"
            ? { type: "or", conditions: seed.conditions }
            : { type: "and", conditions: seed.conditions };
        set_expression_text(serialize_expression(synthetic));
        set_tab("expression");
      } else {
        set_expression_text("");
        set_tab("visual");
      }
    } else {
      set_name("");
      set_color(RULE_COLORS[0]);
      set_match_mode("all");
      set_conditions([]);
      set_actions([]);
      set_expression_text("");
      set_tab("visual");
    }
    set_expression_error(null);
    set_auto_open_index(null);
    set_auto_open_segment(null);
    set_new_indices(new Set());
    set_pending_blank_open(false);
  }, [is_open, rule, seed]);

  const forward_action = actions.find((a) => a.type === "forward") as
    | Extract<Action, { type: "forward" }>
    | undefined;
  const snooze_action = actions.find((a) => a.type === "snooze") as
    | Extract<Action, { type: "snooze" }>
    | undefined;
  const categorize_action = actions.find((a) => a.type === "categorize") as
    | Extract<Action, { type: "categorize" }>
    | undefined;

  const action_present: Record<AddableActionType, boolean> = {
    move_to: actions.some((a) => a.type === "move_to"),
    apply_labels: actions.some((a) => a.type === "apply_labels"),
    mark_as: actions.some((a) => a.type === "mark_as"),
    star: actions.some((a) => a.type === "star"),
    skip_inbox: actions.some((a) => a.type === "skip_inbox"),
    delete: actions.some((a) => a.type === "delete"),
    forward: actions.some((a) => a.type === "forward"),
    auto_reply: actions.some((a) => a.type === "auto_reply"),
    pin: actions.some((a) => a.type === "pin"),
    snooze: actions.some((a) => a.type === "snooze"),
    categorize: actions.some((a) => a.type === "categorize"),
    notify: actions.some((a) => a.type === "notify"),
  };

  const add_options: AddableActionOption[] = ADDABLE_ACTION_TYPES.map(
    (type) => ({
      type,
      label_key: ACTION_LABEL_KEYS[type],
      disabled: action_present[type] || UNAVAILABLE_ACTION_TYPES.has(type),
      disabled_hint_key: UNAVAILABLE_ACTION_TYPES.has(type)
        ? ("mail_rules.coming_soon" as "mail_rules.action_move_to")
        : undefined,
    }),
  );

  const remaining_addable = ADDABLE_ACTION_TYPES.filter(
    (type) => !action_present[type] && !UNAVAILABLE_ACTION_TYPES.has(type),
  );

  const needs_alias_delivery =
    action_present["move_to"] || action_present["apply_labels"];

  React.useEffect(() => {
    if (!needs_alias_delivery || alias_delivery.size > 0) return;
    let cancelled = false;

    void list_all_aliases()
      .then(({ aliases }) => decrypt_aliases(aliases))
      .then((decrypted) => {
        if (cancelled) return;
        set_alias_delivery(
          new Map(
            decrypted.map((alias) => [
              alias.full_address.toLowerCase(),
              {
                delivery_folder_token: alias.delivery_folder_token ?? null,
                delivery_label_token: alias.delivery_label_token ?? null,
                never_inbox: alias.never_inbox ?? false,
              },
            ]),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [needs_alias_delivery, alias_delivery.size]);

  const delivery_conflict = rule_alias_delivery_conflict(
    conditions,
    actions,
    alias_delivery,
  );

  const label_conflict = rule_alias_label_conflict(
    conditions,
    actions,
    alias_delivery,
  );

  const conflict_folder_name = (token: string | null) => {
    if (!token) return t("mail.archive");

    return (
      folders_state.folders.find((folder) => folder.folder_token === token)
        ?.name ?? t("settings.alias_delivery_folder_missing")
    );
  };

  const conflict_label_name = (token: string) =>
    tags_state.tags.find((tag) => tag.tag_token === token)?.name ??
    t("settings.alias_delivery_label_missing");

  const replace_action_at = (index: number, next: Action) => {
    set_actions((prev) => prev.map((a, i) => (i === index ? next : a)));
  };

  const remove_action_at = (index: number) => {
    set_actions((prev) => prev.filter((_, i) => i !== index));
  };

  const handle_add_action = (type: AddableActionType) => {
    set_actions((prev) => [...prev, default_action_for_type(type)]);
  };

  const handle_add_condition = (field: ConditionField) => {
    const next = default_condition(field);
    const new_index = conditions.length;

    set_conditions((prev) => [...prev, next]);
    set_new_indices((prev) => {
      const n = new Set(prev);

      n.add(new_index);
      return n;
    });
    const kind = field_kind(field);

    set_auto_open_index(new_index);
    set_auto_open_segment(
      kind === "boolean" || kind === "auth" ? "value" : "operator",
    );
  };

  const remove_condition_at = (i: number) => {
    if (conditions.length <= 1) {
      set_conditions([]);
      set_new_indices(new Set());
      set_pending_blank_open(true);
      return;
    }
    set_conditions((prev) => prev.filter((_, idx) => idx !== i));
    set_new_indices((prev) => {
      const next = new Set<number>();

      prev.forEach((v) => {
        if (v < i) next.add(v);
        else if (v > i) next.add(v - 1);
      });
      return next;
    });
  };

  const handle_condition_change = (i: number, next_condition: Condition) => {
    set_conditions((prev) =>
      prev.map((x, idx) => (idx === i ? next_condition : x)),
    );
    if (new_indices.has(i) && condition_has_value(next_condition)) {
      set_new_indices((prev) => {
        const n = new Set(prev);

        n.delete(i);
        return n;
      });
    }
  };

  React.useEffect(() => {
    if (tab !== "expression") {
      set_expression_error(null);
      return;
    }
    const text = expression_text;
    if (!text.trim()) {
      set_expression_error(null);
      return;
    }
    const handle = window.setTimeout(() => {
      const result = parse_expression(text);
      if (result.ok) {
        set_expression_error(null);
      } else {
        set_expression_error({
          message: result.error,
          line: result.line,
          col: result.col,
        });
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [tab, expression_text]);

  const nested_logic_present = has_nested_logic(conditions);
  const visual_flat_view: LeafCondition[] = nested_logic_present
    ? flatten_leaves(conditions)
    : (conditions as LeafCondition[]);

  const handle_save = async () => {
    set_saving(true);
    const using_expression = tab === "expression";
    let derived_conditions: Condition[] = conditions;
    let req_match_mode: MatchMode = match_mode;
    let expression_value: string | null = null;
    if (using_expression) {
      expression_value = expression_text;
      const parsed = parse_expression(expression_text);
      if (parsed.ok) {
        if (parsed.ast.type === "and") {
          derived_conditions = parsed.ast.conditions;
          req_match_mode = "all";
        } else if (parsed.ast.type === "or") {
          derived_conditions = parsed.ast.conditions;
          req_match_mode = "any";
        } else {
          derived_conditions = [parsed.ast];
          req_match_mode = "all";
        }
      } else {
        set_expression_error({
          message: parsed.error,
          line: parsed.line,
          col: parsed.col,
        });
        show_toast(friendly_error(parsed.error), "error");
        set_saving(false);
        return;
      }
    }
    const req = {
      name: name.trim() || "Untitled rule",
      color,
      enabled: rule?.enabled ?? true,
      match_mode: req_match_mode,
      conditions: derived_conditions,
      actions,
      expression: expression_value,
    };

    try {
      const result =
        is_edit && rule
          ? await update_rule(rule.id, req)
          : await create_rule(req);

      if (!result) {
        show_toast(t("mail_rules.save_failed"), "error");
        set_saving(false);
        return;
      }
      set_saving(false);
      on_close();
    } catch {
      show_toast(t("mail_rules.save_failed"), "error");
      set_saving(false);
    }
  };

  React.useEffect(() => {
    if (!open || !rule) return;
    void refresh_run(rule.id);
  }, [open, rule?.id]);

  const handle_run_on_existing = async () => {
    if (!rule) return;
    set_running_existing(true);
    const ok = await run_on_existing(rule.id);
    set_running_existing(false);
    show_toast(
      ok
        ? t("mail_rules.apply_to_existing_started")
        : t("mail_rules.apply_to_existing_failed"),
      ok ? "success" : "error",
    );
  };

  const run_status_label = (): string | null => {
    if (!active_run) return null;
    if (active_run.status === "pending") {
      return t("mail_rules.apply_to_existing_queued");
    }
    if (active_run.status === "running") {
      return active_run.total_estimate
        ? t("mail_rules.apply_to_existing_progress_total", {
            scanned: active_run.scanned,
            total: active_run.total_estimate,
            applied: active_run.applied,
          })
        : t("mail_rules.apply_to_existing_progress", {
            scanned: active_run.scanned,
            applied: active_run.applied,
          });
    }
    if (active_run.status === "completed") {
      return t("mail_rules.apply_to_existing_done", {
        scanned: active_run.scanned,
        applied: active_run.applied,
      });
    }
    if (active_run.status === "canceled") {
      return t("mail_rules.apply_to_existing_canceled", {
        applied: active_run.applied,
      });
    }
    return t("mail_rules.apply_to_existing_error");
  };

  const handle_cancel_run = async () => {
    if (!rule) return;
    set_running_existing(true);
    const ok = await cancel_run(rule.id);
    set_running_existing(false);
    if (!ok) {
      show_toast(t("mail_rules.apply_to_existing_cancel_failed"), "error");
    }
  };

  const handle_delete = async () => {
    if (!rule) return;
    set_saving(true);
    await delete_rule(rule.id);
    set_saving(false);
    on_close();
  };

  const regex_hint = (error: string | null): string | null =>
    error
      ? t(
          `mail_rules.${error}` as
            | "mail_rules.regex_invalid"
            | "mail_rules.regex_empty"
            | "mail_rules.regex_too_long"
            | "mail_rules.regex_backreference"
            | "mail_rules.regex_lookaround",
        )
      : null;

  const disabled_hint: string | null = (() => {
    if (!name.trim()) return t("mail_rules.hint_name_required");
    if (tab === "expression") {
      if (!expression_text.trim())
        return t("mail_rules.hint_conditions_required");
      if (expression_error) return t("mail_rules.expression_parse_error");
      const parsed = parse_expression(expression_text);

      if (parsed.ok) {
        const hint = regex_hint(find_regex_condition_error([parsed.ast]));

        if (hint) return hint;
      }
      if (actions.length === 0 || !has_any_action_value(actions)) {
        return t("mail_rules.hint_actions_required");
      }
      if (forward_action && !forward_action.to.trim()) {
        return t("mail_rules.hint_forward_required");
      }
      if (snooze_action && !snooze_action.until_iso8601) {
        return t("mail_rules.hint_snooze_required");
      }
      if (categorize_action && !categorize_action.category) {
        return t("mail_rules.hint_categorize_required");
      }
      return null;
    }
    if (conditions.length === 0)
      return t("mail_rules.hint_conditions_required");
    const any_incomplete = conditions
      .filter((c) => c.type !== "and" && c.type !== "or" && c.type !== "not")
      .some((c) => !condition_has_value(c));

    if (any_incomplete) return t("mail_rules.hint_condition_incomplete");
    const regex_problem = regex_hint(find_regex_condition_error(conditions));

    if (regex_problem) return regex_problem;
    if (actions.length === 0 || !has_any_action_value(actions)) {
      return t("mail_rules.hint_actions_required");
    }
    if (forward_action && !forward_action.to.trim()) {
      return t("mail_rules.hint_forward_required");
    }
    if (snooze_action && !snooze_action.until_iso8601) {
      return t("mail_rules.hint_snooze_required");
    }
    if (categorize_action && !categorize_action.category) {
      return t("mail_rules.hint_categorize_required");
    }
    return null;
  })();

  return (
    <Modal
      is_open={is_open}
      on_close={on_close}
      size="2xl"
      close_on_overlay={false}
    >
      <ModalHeader>
        <ModalTitle>
          {is_edit ? t("mail_rules.edit_rule") : t("mail_rules.create_rule")}
        </ModalTitle>
        <ModalDescription>
          {t("mail_rules.editor_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <div className="flex items-center gap-3">
          <Input
            value={name}
            size="md"
            placeholder={t("mail_rules.rule_name_placeholder")}
            onChange={(e) => set_name(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center gap-1.5">
            {RULE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set_color(c)}
                aria-label={c}
                className="w-5 h-5 rounded-full border-2 transition-shadow"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? c : "transparent",
                  boxShadow:
                    color === c ? `0 0 0 2px white, 0 0 0 3px ${c}` : undefined,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => {
                if (tab === "expression" && expression_text.trim()) {
                  const parsed = parse_expression(expression_text);
                  if (parsed.ok) {
                    if (parsed.ast.type === "and") {
                      set_conditions(parsed.ast.conditions);
                      set_match_mode("all");
                    } else if (parsed.ast.type === "or") {
                      set_conditions(parsed.ast.conditions);
                      set_match_mode("any");
                    } else {
                      set_conditions([parsed.ast]);
                      set_match_mode("all");
                    }
                  }
                }
                set_tab("visual");
              }}
              className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                tab === "visual"
                  ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t("mail_rules.tab_visual")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (tab !== "expression" && !expression_text) {
                  const leaves = flatten_leaves(conditions);
                  if (leaves.length > 0) {
                    const synthetic: Condition =
                      match_mode === "any"
                        ? { type: "or", conditions: leaves }
                        : { type: "and", conditions: leaves };
                    set_expression_text(serialize_expression(synthetic));
                  }
                }
                set_tab("expression");
              }}
              className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                tab === "expression"
                  ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t("mail_rules.tab_expression")}
            </button>
          </div>
          {tab === "visual" ? (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                {t("mail_rules.when_mail_matches")}{" "}
                <span className="lowercase font-normal">
                  {match_mode === "all"
                    ? t("mail_rules.match_all")
                    : t("mail_rules.match_any")}
                </span>
              </div>
              {nested_logic_present && (
                <div className="text-[11.5px] text-amber-600 dark:text-amber-400 mb-2">
                  {t("mail_rules.cannot_render_visual")}
                </div>
              )}
              <div
                className={`flex flex-wrap items-center gap-2 ${
                  nested_logic_present ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {visual_flat_view.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <AndOrPill mode={match_mode} on_change={set_match_mode} />
                    )}
                    <ConditionChip
                      condition={c}
                      auto_open={
                        auto_open_index === i && new_indices.has(i)
                          ? auto_open_segment
                          : null
                      }
                      on_auto_handled={() => {
                        set_auto_open_index(null);
                        set_auto_open_segment(null);
                      }}
                      on_change={(next) => handle_condition_change(i, next)}
                      on_remove={() => remove_condition_at(i)}
                    />
                  </React.Fragment>
                ))}
                {!nested_logic_present && (
                  <AddConditionChip
                    on_pick={handle_add_condition}
                    force_open={pending_blank_open}
                    on_force_open_handled={() => set_pending_blank_open(false)}
                  />
                )}
              </div>
            </>
          ) : (
            <div>
              <textarea
                value={expression_text}
                onChange={(e) => set_expression_text(e.target.value)}
                placeholder={t("mail_rules.expression_placeholder")}
                spellCheck={false}
                rows={6}
                style={{ padding: "14px" }}
                className="aster_input w-full h-[160px] font-mono text-[13px] leading-relaxed resize-none overflow-auto"
              />
              {expression_error && (
                <div className="mt-1 text-[12px] text-rose-500">
                  {friendly_error(expression_error.message)}{" "}
                  <span className="text-rose-400/70">
                    (line {expression_error.line}, col {expression_error.col})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-700" />

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            {t("mail_rules.do_this")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a, i) => (
              <ActionChip
                key={`${a.type}-${i}`}
                action={a}
                on_change={(next) => replace_action_at(i, next)}
                on_remove={() => remove_action_at(i)}
              />
            ))}
            {remaining_addable.length > 0 && (
              <AddActionChip
                options={add_options}
                on_pick={handle_add_action}
              />
            )}
          </div>
          {delivery_conflict && (
            <div
              className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600 dark:text-amber-400"
              data-testid="rule_alias_delivery_warning"
            >
              {t("mail_rules.alias_delivery_conflict", {
                alias: delivery_conflict.alias_address,
                alias_target: conflict_folder_name(
                  delivery_conflict.alias_delivery.delivery_folder_token,
                ),
                rule_target: conflict_folder_name(
                  delivery_conflict.rule_folder_token,
                ),
              })}
            </div>
          )}
          {label_conflict && (
            <div
              className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600 dark:text-amber-400"
              data-testid="rule_alias_label_warning"
            >
              {t("mail_rules.alias_label_conflict", {
                alias: label_conflict.alias_address,
                alias_target: conflict_label_name(
                  label_conflict.alias_label_token,
                ),
                rule_target: label_conflict.rule_label_tokens
                  .map(conflict_label_name)
                  .join(", "),
              })}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="justify-between">
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1">
            {is_edit && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => set_confirm_delete_open(true)}
                  disabled={saving || running_existing}
                  className="text-rose-500 hover:text-rose-600"
                >
                  {t("mail_rules.delete")}
                </Button>
                {run_in_flight ? (
                  <Button
                    variant="ghost"
                    onClick={handle_cancel_run}
                    disabled={saving || running_existing}
                  >
                    {t("mail_rules.apply_to_existing_cancel")}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={handle_run_on_existing}
                    disabled={saving || running_existing}
                  >
                    {t("mail_rules.apply_to_existing")}
                  </Button>
                )}
              </>
            )}
          </div>
          {is_edit && active_run && (
            <span className="text-[11.5px] text-neutral-500">
              {run_status_label()}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={on_close} disabled={saving}>
              {t("mail_rules.cancel")}
            </Button>
            <Button
              variant="depth"
              onClick={handle_save}
              disabled={saving || !!disabled_hint}
            >
              {t("mail_rules.save_rule")}
            </Button>
          </div>
          {disabled_hint && (
            <span className="text-[11.5px] text-neutral-500">
              {disabled_hint}
            </span>
          )}
        </div>
      </ModalFooter>
      <ConfirmationModal
        is_open={confirm_delete_open}
        on_cancel={() => set_confirm_delete_open(false)}
        title={t("mail_rules.delete_rule_title")}
        message={t("mail_rules.delete_rule_body")}
        confirm_text={t("mail_rules.delete")}
        on_confirm={async () => {
          set_confirm_delete_open(false);
          await handle_delete();
        }}
        variant="danger"
      />
    </Modal>
  );
}
