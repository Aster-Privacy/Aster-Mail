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
import type { LeafCondition, Rule, RuleRun } from "@/services/api/mail_rules";
import type { RetentionPolicy } from "@/services/api/retention_policies";

import * as React from "react";
import {
  PlusIcon,
  Bars3Icon,
  BoltIcon,
  Squares2X2Icon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { format_number } from "@/lib/utils";
import { ELLIPSIS } from "@/utils/preview_text";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  use_mail_rules_store,
  load_rules,
  load_runs,
  stop_all_run_polls,
  reorder,
} from "@/stores/mail_rules_store";
import { ConditionChip } from "@/components/mail_rules/condition_chip";
import { ActionChip } from "@/components/mail_rules/action_chip";
import { AndOrPill } from "@/components/mail_rules/and_or_pill";
import { RuleEditorModal } from "@/components/modals/rule_editor_modal";
import { TemplateGalleryModal } from "@/components/mail_rules/template_gallery_modal";
import {
  template_to_seed,
  type RuleEditorSeed,
  type RuleTemplate,
} from "@/components/mail_rules/rule_templates";
import { show_toast } from "@/components/toast/simple_toast";
import { use_register_search_items } from "@/components/settings/search_context";
import {
  use_folder_retention,
  RetentionPolicyCard,
  RetentionEditorModal,
  RetentionUpgradeModal,
} from "@/components/settings/folder_retention_section";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";

export function MailRulesSection() {
  const { t } = use_i18n();
  const { rules, loading, runs, error } = use_mail_rules_store();
  const { state: folders_state, fetch_folders } = use_folders();
  const { state: tags_state, fetch_tags } = use_tags();
  const { limits } = use_plan_limits();
  const retention = use_folder_retention();
  const rules_limit = limits?.limits["max_custom_filters"]?.limit ?? -1;
  const rules_limit_label =
    rules_limit === -1 ? "∞" : format_number(rules_limit);
  const at_limit = rules_limit !== -1 && rules.length >= rules_limit;
  const [editor_open, set_editor_open] = React.useState(false);
  const [editing_rule, set_editing_rule] = React.useState<Rule | null>(null);
  const [seed, set_seed] = React.useState<RuleEditorSeed | null>(null);
  const [gallery_open, set_gallery_open] = React.useState(false);
  const [show_upgrade_modal, set_show_upgrade_modal] = React.useState(false);
  const [drag_index, set_drag_index] = React.useState<number | null>(null);
  const [drag_over_index, set_drag_over_index] = React.useState<number | null>(
    null,
  );
  const [confirm_delete_policy, set_confirm_delete_policy] =
    React.useState<RetentionPolicy | null>(null);

  use_register_search_items("mail_rules", [
    {
      label: t("mail_rules.templates_button"),
      breadcrumb: t("mail_rules.title"),
      keywords: ["template", "starter rule", "preset", "example rule"],
    },
    {
      label: t("folder_retention.add"),
      breadcrumb: `${t("mail_rules.title")} > ${t("folder_retention.title")}`,
      keywords: [
        "auto delete",
        "auto-clean",
        "retention",
        "expire",
        "clean folder",
        "older than",
      ],
    },
  ]);

  React.useEffect(() => {
    load_rules();
    void load_runs();

    return () => {
      stop_all_run_polls();
    };
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
    set_seed(null);
    set_editor_open(true);
  };

  const open_edit = (rule: Rule) => {
    set_editing_rule(rule);
    set_seed(null);
    set_editor_open(true);
  };

  const open_templates = () => {
    if (at_limit) {
      set_show_upgrade_modal(true);

      return;
    }
    set_gallery_open(true);
  };

  const handle_template_pick = (template: RuleTemplate) => {
    set_gallery_open(false);
    if (template.opens_retention) {
      retention.open_new();

      return;
    }
    set_editing_rule(null);
    set_seed(template_to_seed(template, t(template.name_key)));
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
                {loading
                  ? ELLIPSIS
                  : `${format_number(rules.length)}/${rules_limit_label}`}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <Button size="md" variant="outline" onClick={open_templates}>
                <Squares2X2Icon className="w-4 h-4" />
                {t("mail_rules.templates_button")}
              </Button>
              <Button size="md" variant="outline" onClick={retention.open_new}>
                <ClockIcon className="w-4 h-4" />
                {t("folder_retention.add")}
              </Button>
              <Button
                size="md"
                title={at_limit ? t("mail_rules.at_limit_upgrade") : undefined}
                variant="depth"
                onClick={
                  at_limit ? () => set_show_upgrade_modal(true) : open_new
                }
              >
                <PlusIcon className="w-4 h-4" />
                {t("mail_rules.new_rule")}
              </Button>
            </div>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("mail_rules.subtitle")}
        </p>
      </div>

      {(loading || retention.loading) &&
        rules.length === 0 &&
        retention.policies.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
              />
            ))}
          </div>
        )}

      {!loading && error && rules.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <p className="text-sm text-txt-secondary mb-3">
            {t("common.something_went_wrong_try_again")}
          </p>
          <Button onClick={() => void load_rules()} size="sm" variant="outline">
            {t("common.retry")}
          </Button>
        </div>
      )}

      {!retention.loading &&
        retention.load_failed &&
        retention.policies.length === 0 && (
          <LoadFailedNotice on_retry={retention.reload} />
        )}

      {!loading &&
        !error &&
        !retention.loading &&
        !retention.load_failed &&
        rules.length === 0 &&
        retention.policies.length === 0 && (
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
              is_drag_over={drag_over_index === idx && drag_index !== idx}
              on_drag_end={handle_drop}
              on_drag_over={(e) => {
                e.preventDefault();
                set_drag_over_index(idx);
              }}
              on_drag_start={() => set_drag_index(idx)}
              on_drop={handle_drop}
              on_edit={() => open_edit(rule)}
              rule={rule}
              run={runs[rule.id] ?? null}
            />
          ))}
        </div>
      )}

      {retention.policies.length > 0 && (
        <div className="space-y-2">
          {retention.policies.map((policy) => (
            <RetentionPolicyCard
              key={policy.id}
              folder_name={retention.get_folder_name(policy.folder_token)}
              on_delete={() => set_confirm_delete_policy(policy)}
              on_edit={() => retention.open_edit(policy)}
              on_toggle={() => retention.handle_toggle(policy)}
              policy={policy}
            />
          ))}
        </div>
      )}

      <RuleEditorModal
        is_open={editor_open}
        on_close={() => set_editor_open(false)}
        rule={editing_rule}
        seed={seed}
      />

      <TemplateGalleryModal
        is_open={gallery_open}
        on_close={() => set_gallery_open(false)}
        on_select={handle_template_pick}
      />

      <Modal
        is_open={show_upgrade_modal}
        on_close={() => set_show_upgrade_modal(false)}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("mail_rules.rule_limit_reached")}</ModalTitle>
          <ModalDescription>{t("mail_rules.rule_limit_body")}</ModalDescription>
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

      {retention.editor_open && (
        <RetentionEditorModal
          custom_folders={retention.custom_folders}
          existing_tokens={retention.existing_tokens}
          is_open={retention.editor_open}
          on_close={() => retention.set_editor_open(false)}
          on_saved={retention.handle_saved}
          policy={retention.editing}
        />
      )}
      <RetentionUpgradeModal
        is_open={retention.show_upgrade}
        on_close={() => retention.set_show_upgrade(false)}
      />

      <ConfirmationModal
        confirm_text={t("folder_retention.remove")}
        is_open={confirm_delete_policy !== null}
        message={t("common.action_cannot_be_undone")}
        title={t("folder_retention.delete")}
        variant="danger"
        on_cancel={() => set_confirm_delete_policy(null)}
        on_confirm={() => {
          const target = confirm_delete_policy;

          set_confirm_delete_policy(null);

          if (target) void retention.handle_delete(target);
        }}
      />
    </div>
  );
}

interface RuleCardProps {
  rule: Rule;
  run: RuleRun | null;
  is_drag_over: boolean;
  on_drag_start: () => void;
  on_drag_over: (e: React.DragEvent) => void;
  on_drag_end: () => void;
  on_drop: () => void;
  on_edit: () => void;
}

function RuleCard({
  rule,
  run,
  is_drag_over,
  on_drag_start,
  on_drag_over,
  on_drag_end,
  on_drop,
  on_edit,
}: RuleCardProps) {
  const { t } = use_i18n();
  const [draggable_on, set_draggable_on] = React.useState(false);
  const run_label =
    run === null
      ? null
      : run.status === "pending"
        ? t("mail_rules.apply_to_existing_queued")
        : run.status === "running"
          ? run.total_estimate
            ? t("mail_rules.apply_to_existing_progress_total", {
                scanned: run.scanned,
                total: run.total_estimate,
                applied: run.applied,
              })
            : t("mail_rules.apply_to_existing_progress", {
                scanned: run.scanned,
                applied: run.applied,
              })
          : null;

  return (
    <div
      className={`group relative rounded-xl border bg-surf-primary p-4 transition-colors cursor-pointer [&_*]:cursor-pointer hover:bg-surf-secondary ${
        is_drag_over
          ? "border-blue-500 ring-2 ring-blue-500/40"
          : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
      } ${!rule.enabled ? "opacity-60" : ""}`}
      draggable={draggable_on}
      onClick={on_edit}
      onDragEnd={() => {
        set_draggable_on(false);
        on_drag_end();
      }}
      onDragOver={on_drag_over}
      onDragStart={on_drag_start}
      onDrop={on_drop}
    >
      <div className="flex items-start gap-3">
        <button
          className="flex-1 text-start min-w-0 cursor-pointer"
          type="button"
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
            {run_label !== null && (
              <span className="text-[11px] text-txt-secondary flex-shrink-0 truncate">
                · {run_label}
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
                      read_only
                      mode={rule.match_mode}
                      on_change={() => {}}
                    />
                  )}
                  <ConditionChip
                    read_only
                    condition={c as LeafCondition}
                    on_change={() => {}}
                    on_remove={() => {}}
                  />
                </React.Fragment>
              ))}
            <span className="text-neutral-400 text-[12px] px-0.5">→</span>
            {rule.actions.map((a, i) => (
              <ActionChip
                key={`a-${i}`}
                read_only
                action={a}
                on_change={() => {}}
                on_remove={() => {}}
              />
            ))}
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            aria-label={t("mail_rules.drag_handle")}
            className="text-neutral-400 cursor-grab transition-opacity opacity-0 group-hover:opacity-100"
            onMouseDown={() => set_draggable_on(true)}
            onMouseUp={() => set_draggable_on(false)}
          >
            <Bars3Icon className="w-4 h-4" />
          </span>
        </div>
      </div>
    </div>
  );
}
