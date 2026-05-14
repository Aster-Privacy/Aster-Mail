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
import { PlusIcon, Bars3Icon, BoltIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  use_mail_rules_store,
  load_rules,
  reorder,
} from "@/stores/mail_rules_store";
import { ConditionChip } from "@/components/mail_rules/condition_chip";
import { ActionChip } from "@/components/mail_rules/action_chip";
import { AndOrPill } from "@/components/mail_rules/and_or_pill";
import { RuleEditorModal } from "@/components/modals/rule_editor_modal";
import { show_toast } from "@/components/toast/simple_toast";
import type { LeafCondition, Rule } from "@/services/api/mail_rules";

export function MailRulesSection() {
  const { t } = use_i18n();
  const { rules, loading } = use_mail_rules_store();
  const { state: folders_state, fetch_folders } = use_folders();
  const { state: tags_state, fetch_tags } = use_tags();
  const { limits } = use_plan_limits();
  const rules_limit = limits?.limits["max_custom_filters"]?.limit ?? -1;
  const rules_limit_label = rules_limit === -1 ? "∞" : String(rules_limit);
  const at_limit = rules_limit !== -1 && rules.length >= rules_limit;
  const [editor_open, set_editor_open] = React.useState(false);
  const [editing_rule, set_editing_rule] = React.useState<Rule | null>(null);
  const [show_upgrade_modal, set_show_upgrade_modal] = React.useState(false);
  const [drag_index, set_drag_index] = React.useState<number | null>(null);
  const [drag_over_index, set_drag_over_index] = React.useState<number | null>(
    null,
  );

  React.useEffect(() => {
    load_rules();
  }, []);

  React.useEffect(() => {
    if (folders_state.folders.length === 0 && !folders_state.is_loading) {
      fetch_folders();
    }
    if (tags_state.tags.length === 0 && !tags_state.is_loading) {
      fetch_tags();
    }
  }, []);

  const open_new = () => {
    set_editing_rule(null);
    set_editor_open(true);
  };

  const open_edit = (rule: Rule) => {
    set_editing_rule(rule);
    set_editor_open(true);
  };

  const handle_drop = async () => {
    if (
      drag_index === null ||
      drag_over_index === null ||
      drag_index === drag_over_index
    ) {
      set_drag_index(null);
      set_drag_over_index(null);
      return;
    }

    const next = [...rules];
    const [moved] = next.splice(drag_index, 1);

    next.splice(drag_over_index, 0, moved);
    set_drag_index(null);
    set_drag_over_index(null);
    const ok = await reorder(next.map((r) => r.id));

    if (!ok) {
      show_toast(t("mail_rules.reorder_failed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <BoltIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("mail_rules.title")}
              <span className="text-xs font-normal text-txt-muted">
                {loading ? "..." : `${rules.length}/${rules_limit_label}`}
              </span>
            </h3>
            <Button
              size="md"
              variant="depth"
              onClick={at_limit ? () => set_show_upgrade_modal(true) : open_new}
              title={at_limit ? t("mail_rules.at_limit_upgrade") : undefined}
            >
              <PlusIcon className="w-4 h-4" />
              {t("mail_rules.new_rule")}
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("mail_rules.subtitle")}
        </p>
      </div>

      {loading && rules.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && rules.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <BoltIcon className="w-12 h-12 mx-auto mb-2 text-txt-tertiary" />
          <p className="text-sm text-txt-muted mb-1">
            {t("mail_rules.empty_title")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("mail_rules.empty_description")}
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              is_drag_over={drag_over_index === idx && drag_index !== idx}
              on_drag_start={() => set_drag_index(idx)}
              on_drag_over={(e) => {
                e.preventDefault();
                set_drag_over_index(idx);
              }}
              on_drag_end={handle_drop}
              on_drop={handle_drop}
              on_edit={() => open_edit(rule)}
            />
          ))}
        </div>
      )}

      <RuleEditorModal
        is_open={editor_open}
        on_close={() => set_editor_open(false)}
        rule={editing_rule}
      />

      <Modal
        is_open={show_upgrade_modal}
        on_close={() => set_show_upgrade_modal(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("mail_rules.rule_limit_reached")}</ModalTitle>
          <ModalDescription>
            {t("mail_rules.rule_limit_body")}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => set_show_upgrade_modal(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="depth"
            onClick={() => {
              set_show_upgrade_modal(false);
              window.dispatchEvent(
                new CustomEvent("navigate-settings", { detail: "billing" }),
              );
            }}
          >
            {t("common.upgrade_plan")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

interface RuleCardProps {
  rule: Rule;
  is_drag_over: boolean;
  on_drag_start: () => void;
  on_drag_over: (e: React.DragEvent) => void;
  on_drag_end: () => void;
  on_drop: () => void;
  on_edit: () => void;
}

function RuleCard({
  rule,
  is_drag_over,
  on_drag_start,
  on_drag_over,
  on_drag_end,
  on_drop,
  on_edit,
}: RuleCardProps) {
  const { t } = use_i18n();
  const [draggable_on, set_draggable_on] = React.useState(false);

  return (
    <div
      draggable={draggable_on}
      onDragStart={on_drag_start}
      onDragOver={on_drag_over}
      onDragEnd={() => {
        set_draggable_on(false);
        on_drag_end();
      }}
      onDrop={on_drop}
      onClick={on_edit}
      className={`group relative rounded-xl border bg-surf-primary p-4 transition-colors cursor-pointer [&_*]:cursor-pointer hover:bg-surf-secondary ${
        is_drag_over
          ? "border-blue-500 ring-2 ring-blue-500/40"
          : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
      } ${!rule.enabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={on_edit}
          className="flex-1 text-left min-w-0 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: rule.color }}
            />
            <span className="text-[13px] font-medium text-txt-primary truncate">
              {rule.name}
            </span>
            {rule.applied_count > 0 && (
              <span className="text-[11px] text-txt-tertiary flex-shrink-0">
                · {t("mail_rules.applied_count", { count: rule.applied_count })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {rule.conditions
              .filter(
                (c) => c.type !== "and" && c.type !== "or" && c.type !== "not",
              )
              .map((c, i) => (
                <React.Fragment key={`c-${i}`}>
                  {i > 0 && (
                    <AndOrPill
                      mode={rule.match_mode}
                      on_change={() => {}}
                      read_only
                    />
                  )}
                  <ConditionChip
                    condition={c as LeafCondition}
                    read_only
                    on_change={() => {}}
                    on_remove={() => {}}
                  />
                </React.Fragment>
              ))}
            <span className="text-neutral-400 text-[12px] px-0.5">→</span>
            {rule.actions.map((a, i) => (
              <ActionChip
                key={`a-${i}`}
                action={a}
                read_only
                on_change={() => {}}
                on_remove={() => {}}
              />
            ))}
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className="text-neutral-400 cursor-grab transition-opacity opacity-0 group-hover:opacity-100"
            onMouseDown={() => set_draggable_on(true)}
            onMouseUp={() => set_draggable_on(false)}
            aria-label="drag handle"
          >
            <Bars3Icon className="w-4 h-4" />
          </span>
        </div>
      </div>
    </div>
  );
}
