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
import { useCallback, useEffect, useState } from "react";
import {
  TrashIcon,
  PlusIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  UserGroupIcon,
  ArrowUpRightIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { FeatureLockOverlay } from "@/components/settings/aliases/feature_lock";
import {
  list_alias_pins,
  add_alias_pin,
  delete_alias_pin,
  set_alias_pin_mode,
  decrypt_alias_pin,
  SENDER_PIN_MODE_OFF,
  SENDER_PIN_MODE_LOCK_FIRST,
  SENDER_PIN_MODE_ALLOWLIST,
  type DecryptedAliasPin,
  type SenderPinMode,
} from "@/services/api/alias_pins";
import {
  list_alias_rules,
  create_alias_rule,
  update_alias_rule,
  delete_alias_rule,
  type AliasRule,
  type AliasRuleCondition,
  type AliasRuleField,
  type AliasRuleOperator,
  type AliasRuleActions,
} from "@/services/api/alias_rules";
import {
  list_alias_contacts,
  add_alias_contact,
  delete_alias_contact,
  set_alias_contact_blocked,
  decrypt_alias_contact,
  type DecryptedAliasContact,
} from "@/services/api/alias_contacts";
import {
  list_alias_destinations,
  add_alias_destination,
  delete_alias_destination,
  set_alias_delivery_mode,
  decrypt_alias_destination,
  DELIVERY_MODE_NATIVE,
  DELIVERY_MODE_RELAY,
  type DecryptedAliasDestination,
  type DeliveryMode,
} from "@/services/api/alias_destinations";

const INPUT_CLASS =
  "flex-1 min-w-0 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none";

const SEGMENT_SELECTED = "border-blue-600 bg-blue-600 text-white shadow-sm";
const SEGMENT_UNSELECTED =
  "border-edge-secondary text-txt-primary hover:bg-surf-hover";

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-txt-primary">
      {icon}
      {children}
    </h4>
  );
}

function SenderPinningPanel({ alias_id }: { alias_id: string }) {
  const { t } = use_i18n();
  const [mode, set_mode] = useState<SenderPinMode>(SENDER_PIN_MODE_OFF);
  const [pins, set_pins] = useState<DecryptedAliasPin[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_alias_pins(alias_id);

      if (response.data) {
        set_mode(response.data.mode ?? SENDER_PIN_MODE_OFF);
        const decrypted = await Promise.all(
          (response.data.pins ?? []).map((p) =>
            decrypt_alias_pin(p, t("settings.alias_sender_unknown")),
          ),
        );

        set_pins(decrypted);
      }
    } catch {
      set_pins([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const change_mode = async (next: SenderPinMode) => {
    const prev = mode;

    set_mode(next);
    const response = await set_alias_pin_mode(alias_id, next);

    if (response.error) {
      set_mode(prev);
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_pin_mode_updated"), "success");
    }
  };

  const handle_add = async () => {
    if (!email.trim()) return;
    set_busy(true);
    try {
      const response = await add_alias_pin(alias_id, email);

      if (response.error) {
        show_toast(t("settings.alias_sender_add_failed"), "error");
      } else {
        set_email("");
        show_toast(t("settings.alias_sender_added"), "success");
        await load();
      }
    } finally {
      set_busy(false);
    }
  };

  const handle_remove = async (pin_id: string) => {
    const response = await delete_alias_pin(alias_id, pin_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_sender_removed"), "success");
      set_pins((prev) => prev.filter((p) => p.id !== pin_id));
    }
  };

  const modes: {
    value: SenderPinMode;
    label: string;
    hint: string;
  }[] = [
    {
      value: SENDER_PIN_MODE_OFF,
      label: t("settings.alias_sender_pin_mode_off"),
      hint: t("settings.alias_sender_pin_mode_off_hint"),
    },
    {
      value: SENDER_PIN_MODE_LOCK_FIRST,
      label: t("settings.alias_sender_pin_mode_lock_first"),
      hint: t("settings.alias_sender_pin_mode_lock_first_hint"),
    },
    {
      value: SENDER_PIN_MODE_ALLOWLIST,
      label: t("settings.alias_sender_pin_mode_allowlist"),
      hint: t("settings.alias_sender_pin_mode_allowlist_hint"),
    },
  ];

  return (
    <div className="space-y-3">
      <SectionTitle icon={<ShieldCheckIcon className="w-4 h-4" />}>
        {t("settings.alias_sender_pinning_title")}
      </SectionTitle>
      <p className="text-xs text-txt-muted">
        {t("settings.alias_sender_pinning_description")}
      </p>
      <div className="space-y-1.5">
        {modes.map((m) => (
          <button
            key={m.value}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
              mode === m.value ? SEGMENT_SELECTED : SEGMENT_UNSELECTED
            }`}
            type="button"
            onClick={() => change_mode(m.value)}
          >
            <span
              className={`block text-sm font-medium ${
                mode === m.value ? "text-white" : "text-txt-primary"
              }`}
            >
              {m.label}
            </span>
            <span
              className={`block text-xs ${
                mode === m.value ? "text-white/80" : "text-txt-muted"
              }`}
            >
              {m.hint}
            </span>
          </button>
        ))}
      </div>

      {mode === SENDER_PIN_MODE_ALLOWLIST && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className={INPUT_CLASS}
              placeholder={t("settings.alias_sender_email_placeholder")}
              type="email"
              value={email}
              onChange={(e) => set_email(e.target.value)}
              onKeyDown={(e) => e["key"] === "Enter" && handle_add()}
            />
            <Button
              disabled={busy || !email.trim()}
              size="sm"
              variant="depth"
              onClick={handle_add}
            >
              <PlusIcon className="w-4 h-4" />
              {t("settings.alias_sender_add")}
            </Button>
          </div>

          {loading ? (
            <Spinner size="md" />
          ) : pins.length === 0 ? (
            <p className="text-xs text-txt-muted">
              {t("settings.alias_sender_list_empty")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
                >
                  <span className="flex-1 min-w-0 text-sm truncate text-txt-primary">
                    {pin.sender}
                  </span>
                  <Button
                    className="h-7 w-7 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    size="icon"
                    variant="ghost"
                    onClick={() => handle_remove(pin.id)}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RULE_FIELDS: AliasRuleField[] = ["all", "from", "to", "subject"];
const RULE_OPERATORS: AliasRuleOperator[] = [
  "contains",
  "equals",
  "starts_with",
  "ends_with",
  "matches_regex",
];

function field_label(t: ReturnType<typeof use_i18n>["t"], field: AliasRuleField) {
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

function operator_label(
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
  }
}

function RuleBuilder({
  on_save,
  on_cancel,
  saving,
}: {
  on_save: (
    conditions: AliasRuleCondition[],
    actions: AliasRuleActions,
  ) => void;
  on_cancel: () => void;
  saving: boolean;
}) {
  const { t } = use_i18n();
  const [conditions, set_conditions] = useState<AliasRuleCondition[]>([
    { field: "from", operator: "contains", value: "" },
  ]);
  const [actions, set_actions] = useState<AliasRuleActions>({});

  const has_action =
    !!actions.block ||
    !!actions.to_trash ||
    !!actions.label?.trim() ||
    !!actions.banner?.trim() ||
    !!actions.subject_mask?.trim() ||
    !!actions.auto_reply?.trim();
  const has_conditions = conditions.every(
    (c) => c.field === "all" || c.value.trim().length > 0,
  );
  const can_save = has_action && has_conditions && !saving;

  const update_condition = (
    index: number,
    patch: Partial<AliasRuleCondition>,
  ) => {
    set_conditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const remove_condition = (index: number) => {
    set_conditions((prev) => prev.filter((_, i) => i !== index));
  };

  const toggle_bool_action = (key: "block" | "to_trash") => {
    set_actions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const update_text_action = (
    key: "label" | "banner" | "subject_mask" | "auto_reply",
    value: string,
  ) => {
    set_actions((prev) => ({ ...prev, [key]: value }));
  };

  const handle_save = () => {
    const cleaned_actions: AliasRuleActions = {};

    if (actions.block) cleaned_actions.block = true;
    if (actions.to_trash) cleaned_actions.to_trash = true;
    if (actions.label?.trim()) cleaned_actions.label = actions.label.trim();
    if (actions.banner?.trim()) cleaned_actions.banner = actions.banner.trim();
    if (actions.subject_mask?.trim())
      cleaned_actions.subject_mask = actions.subject_mask.trim();
    if (actions.auto_reply?.trim())
      cleaned_actions.auto_reply = actions.auto_reply.trim();

    if (Object.keys(cleaned_actions).length === 0) {
      show_toast(t("settings.alias_rule_needs_action"), "error");

      return;
    }

    on_save(
      conditions.filter((c) => c.field === "all" || c.value.trim().length > 0),
      cleaned_actions,
    );
    set_conditions([{ field: "from", operator: "contains", value: "" }]);
    set_actions({});
  };

  return (
    <div className="space-y-3 p-3 rounded-lg border border-dashed border-edge-secondary">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-txt-primary">
          {t("settings.alias_rule_new_title")}
        </p>
        <Button
          className="h-7 w-7"
          size="icon"
          title={t("settings.alias_rule_close")}
          variant="ghost"
          onClick={on_cancel}
        >
          <XMarkIcon className="w-4 h-4 text-txt-muted" />
        </Button>
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-txt-muted">
        {t("settings.alias_rule_when")}
      </p>
      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 min-w-[120px]">
              <span className="text-[11px] text-txt-muted">
                {t("settings.alias_rule_field_label")}
              </span>
              <Select
                value={condition.field}
                onValueChange={(value) =>
                  update_condition(index, {
                    field: value as AliasRuleField,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {field_label(t, f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <span className="text-[11px] text-txt-muted">
                {t("settings.alias_rule_operator_label")}
              </span>
              <Select
                value={condition.operator}
                onValueChange={(value) =>
                  update_condition(index, {
                    operator: value as AliasRuleOperator,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {operator_label(t, op)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <span className="text-[11px] text-txt-muted">
                {t("settings.alias_rule_value_label")}
              </span>
              <input
                className={INPUT_CLASS}
                disabled={condition.field === "all"}
                placeholder={t("settings.alias_rule_value_placeholder")}
                value={condition.value}
                onChange={(e) =>
                  update_condition(index, { value: e.target.value })
                }
              />
            </div>
            {conditions.length > 1 && (
              <Button
                className="h-9 w-9 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                size="icon"
                variant="ghost"
                onClick={() => remove_condition(index)}
              >
                <TrashIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            set_conditions((prev) => [
              ...prev,
              { field: "from", operator: "contains", value: "" },
            ])
          }
        >
          <PlusIcon className="w-4 h-4" />
          {t("settings.alias_rule_add_condition")}
        </Button>
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-txt-muted">
        {t("settings.alias_rule_then")}
      </p>
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-txt-primary">
            {t("settings.alias_rule_action_block")}
          </span>
          <Switch
            checked={!!actions.block}
            onCheckedChange={() => toggle_bool_action("block")}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-txt-primary">
            {t("settings.alias_rule_action_to_trash")}
          </span>
          <Switch
            checked={!!actions.to_trash}
            onCheckedChange={() => toggle_bool_action("to_trash")}
          />
        </label>
        <input
          className={`${INPUT_CLASS} w-full`}
          placeholder={t("settings.alias_rule_action_label_placeholder")}
          value={actions.label ?? ""}
          onChange={(e) => update_text_action("label", e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} w-full`}
          placeholder={t("settings.alias_rule_action_banner_placeholder")}
          value={actions.banner ?? ""}
          onChange={(e) => update_text_action("banner", e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} w-full`}
          placeholder={t("settings.alias_rule_action_subject_mask_placeholder")}
          value={actions.subject_mask ?? ""}
          onChange={(e) => update_text_action("subject_mask", e.target.value)}
        />
        <textarea
          className="w-full min-h-[60px] px-3 py-2 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none"
          placeholder={t("settings.alias_rule_action_auto_reply_placeholder")}
          value={actions.auto_reply ?? ""}
          onChange={(e) => update_text_action("auto_reply", e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          disabled={saving}
          size="sm"
          variant="outline"
          onClick={on_cancel}
        >
          {t("settings.alias_rule_cancel")}
        </Button>
        <Button
          disabled={!can_save}
          size="sm"
          variant="depth"
          onClick={handle_save}
        >
          {saving ? <Spinner size="xs" /> : null}
          {t("settings.alias_rule_save")}
        </Button>
      </div>
    </div>
  );
}

function RulesPanel({ alias_id }: { alias_id: string }) {
  const { t } = use_i18n();
  const [rules, set_rules] = useState<AliasRule[]>([]);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [show_builder, set_show_builder] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_alias_rules(alias_id);

      if (response.data) {
        set_rules(response.data.rules ?? []);
      }
    } catch {
      set_rules([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_create = async (
    conditions: AliasRuleCondition[],
    actions: AliasRuleActions,
  ) => {
    set_saving(true);
    try {
      const response = await create_alias_rule(alias_id, {
        priority: rules.length,
        conditions,
        actions,
        is_enabled: true,
      });

      if (response.error) {
        show_toast(t("settings.alias_rule_save_failed"), "error");
      } else {
        show_toast(t("settings.alias_rule_added"), "success");
        set_show_builder(false);
        await load();
      }
    } finally {
      set_saving(false);
    }
  };

  const handle_toggle = async (rule: AliasRule) => {
    const next = !rule.is_enabled;

    set_rules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: next } : r)),
    );
    const response = await update_alias_rule(alias_id, rule.id, {
      is_enabled: next,
    });

    if (response.error) {
      set_rules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_enabled: rule.is_enabled } : r,
        ),
      );
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_rule_updated"), "success");
    }
  };

  const handle_delete = async (rule_id: string) => {
    const response = await delete_alias_rule(alias_id, rule_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_rule_removed"), "success");
      set_rules((prev) => prev.filter((r) => r.id !== rule_id));
    }
  };

  const describe_actions = (actions: AliasRuleActions): string => {
    const parts: string[] = [];

    if (actions.block) parts.push(t("settings.alias_rule_action_block"));
    if (actions.to_trash) parts.push(t("settings.alias_rule_action_to_trash"));
    if (actions.label) parts.push(t("settings.alias_rule_action_label"));
    if (actions.banner) parts.push(t("settings.alias_rule_action_banner"));
    if (actions.subject_mask)
      parts.push(t("settings.alias_rule_action_subject_mask"));
    if (actions.auto_reply)
      parts.push(t("settings.alias_rule_action_auto_reply"));

    return parts.join(", ");
  };

  return (
    <div className="space-y-3">
      <SectionTitle icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}>
        {t("settings.alias_rules_title")}
      </SectionTitle>
      <p className="text-xs text-txt-muted">
        {t("settings.alias_rules_description")}
      </p>

      {loading ? (
        <Spinner size="md" />
      ) : rules.length === 0 && !show_builder ? (
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
                  {rule.conditions
                    .map(
                      (c) =>
                        `${field_label(t, c.field)} ${operator_label(
                          t,
                          c.operator,
                        )} ${c.value}`.trim(),
                    )
                    .join(" · ")}
                </p>
                <p className="text-xs text-txt-muted truncate">
                  {describe_actions(rule.actions)}
                </p>
              </div>
              <Switch
                checked={rule.is_enabled}
                onCheckedChange={() => handle_toggle(rule)}
              />
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

      {show_builder ? (
        <RuleBuilder
          on_cancel={() => set_show_builder(false)}
          on_save={handle_create}
          saving={saving}
        />
      ) : (
        <Button size="sm" variant="depth" onClick={() => set_show_builder(true)}>
          <PlusIcon className="w-4 h-4" />
          {t("settings.alias_rule_add")}
        </Button>
      )}
    </div>
  );
}

function ContactsPanel({ alias_id }: { alias_id: string }) {
  const { t } = use_i18n();
  const [contacts, set_contacts] = useState<DecryptedAliasContact[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_alias_contacts(alias_id);

      if (response.data) {
        const decrypted = await Promise.all(
          (response.data.contacts ?? []).map((c) =>
            decrypt_alias_contact(c, t("settings.alias_contact_unknown")),
          ),
        );

        set_contacts(decrypted);
      }
    } catch {
      set_contacts([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_add = async () => {
    if (!email.trim()) return;
    set_busy(true);
    try {
      const response = await add_alias_contact(alias_id, email);

      if (response.error) {
        show_toast(t("settings.alias_contact_add_failed"), "error");
      } else {
        set_email("");
        show_toast(t("settings.alias_contact_added"), "success");
        await load();
      }
    } finally {
      set_busy(false);
    }
  };

  const handle_block = async (contact: DecryptedAliasContact) => {
    const next = !contact.is_blocked;

    set_contacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, is_blocked: next } : c)),
    );
    const response = await set_alias_contact_blocked(
      alias_id,
      contact.id,
      next,
    );

    if (response.error) {
      set_contacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, is_blocked: contact.is_blocked } : c,
        ),
      );
      show_toast(response.error, "error");
    }
  };

  const handle_delete = async (contact_id: string) => {
    const response = await delete_alias_contact(alias_id, contact_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_contact_removed"), "success");
      set_contacts((prev) => prev.filter((c) => c.id !== contact_id));
    }
  };

  return (
    <div className="space-y-3">
      <SectionTitle icon={<UserGroupIcon className="w-4 h-4" />}>
        {t("settings.alias_contacts_title")}
      </SectionTitle>
      <p className="text-xs text-txt-muted">
        {t("settings.alias_contacts_description")}
      </p>

      <div className="flex items-center gap-2">
        <input
          className={INPUT_CLASS}
          placeholder={t("settings.alias_contact_email_placeholder")}
          type="email"
          value={email}
          onChange={(e) => set_email(e.target.value)}
          onKeyDown={(e) => e["key"] === "Enter" && handle_add()}
        />
        <Button
          disabled={busy || !email.trim()}
          size="sm"
          variant="depth"
          onClick={handle_add}
        >
          <PlusIcon className="w-4 h-4" />
          {t("settings.alias_contact_add")}
        </Button>
      </div>

      {loading ? (
        <Spinner size="md" />
      ) : contacts.length === 0 ? (
        <p className="text-xs text-txt-muted">
          {t("settings.alias_contacts_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
            >
              <span className="flex-1 min-w-0 text-sm truncate text-txt-primary">
                {contact.contact}
              </span>
              {contact.is_blocked && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                  {t("settings.alias_contact_blocked")}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handle_block(contact)}
              >
                <NoSymbolIcon className="w-4 h-4" />
                {contact.is_blocked
                  ? t("settings.alias_contact_unblock")
                  : t("settings.alias_contact_block")}
              </Button>
              <Button
                className="h-7 w-7 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                size="icon"
                variant="ghost"
                onClick={() => handle_delete(contact.id)}
              >
                <TrashIcon className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelayPanel({ alias_id }: { alias_id: string }) {
  const { t } = use_i18n();
  const [mode, set_mode] = useState<DeliveryMode>(DELIVERY_MODE_NATIVE);
  const [destinations, set_destinations] = useState<
    DecryptedAliasDestination[]
  >([]);
  const [loading, set_loading] = useState(true);
  const [address, set_address] = useState("");
  const [pgp_key, set_pgp_key] = useState("");
  const [strip_trackers, set_strip_trackers] = useState(true);
  const [keep_copy, set_keep_copy] = useState(false);
  const [busy, set_busy] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_alias_destinations(alias_id);

      if (response.data) {
        set_mode(response.data.delivery_mode ?? DELIVERY_MODE_NATIVE);
        const decrypted = await Promise.all(
          (response.data.destinations ?? []).map((d) =>
            decrypt_alias_destination(
              d,
              t("settings.alias_relay_destination_unknown"),
            ),
          ),
        );

        set_destinations(decrypted);
      }
    } catch {
      set_destinations([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const change_mode = async (next: DeliveryMode) => {
    const prev = mode;

    set_mode(next);
    const response = await set_alias_delivery_mode(alias_id, next);

    if (response.error) {
      set_mode(prev);
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_relay_mode_updated"), "success");
    }
  };

  const handle_add = async () => {
    if (!address.trim()) return;
    set_busy(true);
    try {
      const response = await add_alias_destination(alias_id, address, {
        pgp_public_key: pgp_key,
        strip_trackers,
        keep_copy,
      });

      if (response.error) {
        show_toast(t("settings.alias_relay_destination_add_failed"), "error");
      } else {
        set_address("");
        set_pgp_key("");
        show_toast(t("settings.alias_relay_destination_added"), "success");
        await load();
      }
    } finally {
      set_busy(false);
    }
  };

  const handle_delete = async (destination_id: string) => {
    const response = await delete_alias_destination(alias_id, destination_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_relay_destination_removed"), "success");
      set_destinations((prev) => prev.filter((d) => d.id !== destination_id));
    }
  };

  return (
    <div className="space-y-3">
      <SectionTitle icon={<ArrowUpRightIcon className="w-4 h-4" />}>
        {t("settings.alias_relay_title")}
      </SectionTitle>
      <p className="text-xs text-txt-muted">
        {t("settings.alias_relay_description")}
      </p>

      <div className="space-y-1.5">
        <button
          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
            mode === DELIVERY_MODE_NATIVE
              ? SEGMENT_SELECTED
              : SEGMENT_UNSELECTED
          }`}
          type="button"
          onClick={() => change_mode(DELIVERY_MODE_NATIVE)}
        >
          <span
            className={`block text-sm font-medium ${
              mode === DELIVERY_MODE_NATIVE ? "text-white" : "text-txt-primary"
            }`}
          >
            {t("settings.alias_relay_mode_native")}
          </span>
          <span
            className={`block text-xs ${
              mode === DELIVERY_MODE_NATIVE ? "text-white/80" : "text-txt-muted"
            }`}
          >
            {t("settings.alias_relay_mode_native_hint")}
          </span>
        </button>
        <button
          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
            mode === DELIVERY_MODE_RELAY
              ? SEGMENT_SELECTED
              : SEGMENT_UNSELECTED
          }`}
          type="button"
          onClick={() => change_mode(DELIVERY_MODE_RELAY)}
        >
          <span
            className={`block text-sm font-medium ${
              mode === DELIVERY_MODE_RELAY ? "text-white" : "text-txt-primary"
            }`}
          >
            {t("settings.alias_relay_mode_relay")}
          </span>
          <span
            className={`block text-xs ${
              mode === DELIVERY_MODE_RELAY ? "text-white/80" : "text-txt-muted"
            }`}
          >
            {t("settings.alias_relay_mode_relay_hint")}
          </span>
        </button>
      </div>

      {mode === DELIVERY_MODE_RELAY && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("settings.alias_relay_not_private_warning")}
            </p>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-txt-muted">
            {t("settings.alias_relay_destinations_title")}
          </p>

          {loading ? (
            <Spinner size="md" />
          ) : destinations.length === 0 ? (
            <p className="text-xs text-txt-muted">
              {t("settings.alias_relay_destination_empty")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {destinations.map((destination) => (
                <div
                  key={destination.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
                >
                  <span className="flex-1 min-w-0 text-sm truncate text-txt-primary">
                    {destination.destination}
                  </span>
                  <Button
                    className="h-7 w-7 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    size="icon"
                    variant="ghost"
                    onClick={() => handle_delete(destination.id)}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <input
            className={`${INPUT_CLASS} w-full`}
            placeholder={t("settings.alias_relay_destination_placeholder")}
            type="email"
            value={address}
            onChange={(e) => set_address(e.target.value)}
          />
          <textarea
            className="w-full min-h-[60px] px-3 py-2 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none"
            placeholder={t("settings.alias_relay_pgp_key_placeholder")}
            value={pgp_key}
            onChange={(e) => set_pgp_key(e.target.value)}
          />
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm text-txt-primary">
              {t("settings.alias_relay_strip_trackers")}
            </span>
            <Switch
              checked={strip_trackers}
              onCheckedChange={set_strip_trackers}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm text-txt-primary">
              {t("settings.alias_relay_keep_copy")}
            </span>
            <Switch checked={keep_copy} onCheckedChange={set_keep_copy} />
          </label>
          <Button
            disabled={busy || !address.trim()}
            size="sm"
            variant="depth"
            onClick={handle_add}
          >
            <PlusIcon className="w-4 h-4" />
            {t("settings.alias_relay_destination_add")}
          </Button>
        </div>
      )}
    </div>
  );
}

function LockedSection({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <FeatureLockOverlay message={message} />
    </div>
  );
}

export function AliasAdvancedPanel({ alias_id }: { alias_id: string }) {
  const { t } = use_i18n();
  const { is_feature_locked, is_loading } = use_plan_limits();

  if (is_loading) {
    return (
      <div className="mt-3 pt-3 border-t border-edge-secondary">
        <Spinner size="md" />
      </div>
    );
  }

  const sender_locked = is_feature_locked("has_sender_pinning");
  const relay_locked = is_feature_locked("has_alias_external_relay");
  const rules_locked = is_feature_locked("has_alias_rules");
  const contacts_locked = is_feature_locked("max_reverse_contacts_per_alias");

  return (
    <div className="mt-3 pt-3 border-t border-edge-secondary space-y-5">
      {sender_locked ? (
        <LockedSection
          icon={<ShieldCheckIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_sender_pinning")}
          title={t("settings.alias_sender_pinning_title")}
        />
      ) : (
        <SenderPinningPanel alias_id={alias_id} />
      )}
      {relay_locked ? (
        <LockedSection
          icon={<ArrowUpRightIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_relay")}
          title={t("settings.alias_relay_title")}
        />
      ) : (
        <RelayPanel alias_id={alias_id} />
      )}
      {rules_locked ? (
        <LockedSection
          icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_rules")}
          title={t("settings.alias_rules_title")}
        />
      ) : (
        <RulesPanel alias_id={alias_id} />
      )}
      {contacts_locked ? (
        <LockedSection
          icon={<UserGroupIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_contacts")}
          title={t("settings.alias_contacts_title")}
        />
      ) : (
        <ContactsPanel alias_id={alias_id} />
      )}
    </div>
  );
}
