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
  NoSymbolIcon,
  PencilSquareIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";
import { AliasRuleEditorModal } from "@/components/settings/aliases/alias_rule_editor_modal";

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
import { get_alias_preferences } from "@/services/api/aliases";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import {
  list_alias_pins,
  add_alias_pin,
  delete_alias_pin,
  set_alias_pin_mode,
  list_domain_address_pins,
  add_domain_address_pin,
  delete_domain_address_pin,
  set_domain_address_pin_mode,
  decrypt_alias_pin,
  SENDER_PIN_MODE_OFF,
  SENDER_PIN_MODE_LOCK_FIRST,
  SENDER_PIN_MODE_ALLOWLIST,
  type DecryptedAliasPin,
  type SenderPinMode,
} from "@/services/api/alias_pins";
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
import {
  list_alias_contacts,
  add_alias_contact,
  delete_alias_contact,
  set_alias_contact_blocked,
  list_domain_address_contacts,
  add_domain_address_contact,
  delete_domain_address_contact,
  set_domain_address_contact_blocked,
  decrypt_alias_contact,
  type DecryptedAliasContact,
} from "@/services/api/alias_contacts";
import {
  get_alias_delivery_log,
  get_domain_address_delivery_log,
  type DeliveryEvent,
} from "@/services/api/aliases";

const INPUT_CLASS =
  "flex-1 min-w-0 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none";


function SectionTitle({
  icon,
  info,
  info_title,
  children,
}: {
  icon: React.ReactNode;
  info?: string;
  info_title?: string;
  children: React.ReactNode;
}) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-txt-primary">
      {icon}
      {children}
      {info && <InfoHint tip={info} title={info_title} />}
    </h4>
  );
}

function SenderPinningPanel({ alias_id, domain_address_id }: { alias_id?: string; domain_address_id?: string }) {
  const { t } = use_i18n();
  const [mode, set_mode] = useState<SenderPinMode>(SENDER_PIN_MODE_OFF);
  const [pins, set_pins] = useState<DecryptedAliasPin[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = domain_address_id
        ? await list_domain_address_pins(domain_address_id)
        : await list_alias_pins(alias_id!);

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
  }, [alias_id, domain_address_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const change_mode = async (next: SenderPinMode) => {
    const prev = mode;

    set_mode(next);
    const response = domain_address_id
      ? await set_domain_address_pin_mode(domain_address_id, next)
      : await set_alias_pin_mode(alias_id!, next);

    if (response.error) {
      set_mode(prev);
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_pin_mode_updated"), "success");
    }
  };

  const handle_add = async () => {
    const value = email.trim();

    if (!value) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      show_toast(t("settings.alias_sender_invalid"), "error");
      return;
    }

    set_busy(true);
    try {
      const response = domain_address_id
        ? await add_domain_address_pin(domain_address_id, value)
        : await add_alias_pin(alias_id!, value);

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
    const response = domain_address_id
      ? await delete_domain_address_pin(domain_address_id, pin_id)
      : await delete_alias_pin(alias_id!, pin_id);

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
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <SectionTitle
            icon={<ShieldCheckIcon className="w-4 h-4" />}
            info={t("settings.alias_sender_pinning_info")}
            info_title={t("settings.alias_sender_pinning_title")}
          >
            {t("settings.alias_sender_pinning_title")}
          </SectionTitle>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.alias_sender_pinning_description")}
          </p>
        </div>
        <Select
          value={String(mode)}
          onValueChange={(v) => change_mode(Number(v) as SenderPinMode)}
        >
          <SelectTrigger className="h-9 w-44 shrink-0 bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
    default:
      return operator;
  }
}


function RulesPanel({ alias_id, domain_address_id }: { alias_id?: string; domain_address_id?: string }) {
  const { t } = use_i18n();
  const [rules, set_rules] = useState<AliasRule[]>([]);
  const [loading, set_loading] = useState(true);
  const [modal_open, set_modal_open] = useState(false);
  const [editing_rule, set_editing_rule] = useState<AliasRule | null>(null);

  const load = useCallback(async () => {
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
  }, [alias_id, domain_address_id]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_toggle = async (rule: AliasRule) => {
    const next = !rule.is_enabled;
    set_rules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: next } : r)),
    );
    const response = domain_address_id
      ? await update_domain_address_rule(domain_address_id, rule.id, { is_enabled: next })
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
    if (a.label) parts.push(`${t("settings.alias_rule_action_label")}: ${a.label}`);
    return parts.join(", ");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <SectionTitle
            icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}
            info={t("settings.alias_rules_info")}
            info_title={t("settings.alias_rules_title")}
          >
            {t("settings.alias_rules_title")}
          </SectionTitle>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.alias_rules_description")}
          </p>
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
        <p className="text-xs text-txt-muted">{t("settings.alias_rules_empty")}</p>
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
        rule={editing_rule}
        on_close={() => set_modal_open(false)}
        on_saved={load}
      />
    </div>
  );
}

function ContactsPanel({ alias_id, domain_address_id, alias_local_part, alias_domain }: { alias_id?: string; domain_address_id?: string; alias_local_part?: string; alias_domain?: string }) {
  const { t } = use_i18n();
  const [contacts, set_contacts] = useState<DecryptedAliasContact[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);
  const [readable_reverse, set_readable_reverse] = useState(false);

  useEffect(() => {
    get_alias_preferences().then((r) => {
      if (r.data?.readable_reverse_aliases) set_readable_reverse(true);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = domain_address_id
        ? await list_domain_address_contacts(domain_address_id)
        : await list_alias_contacts(alias_id!);

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
  }, [alias_id, domain_address_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_add = async () => {
    const value = email.trim();

    if (!value) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      show_toast(t("settings.alias_sender_invalid"), "error");
      return;
    }

    set_busy(true);
    try {
      const response = domain_address_id
        ? await add_domain_address_contact(domain_address_id, value, alias_local_part ?? "", alias_domain ?? "")
        : await add_alias_contact(alias_id!, value, readable_reverse);

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
    const response = domain_address_id
      ? await set_domain_address_contact_blocked(domain_address_id, contact.id, next)
      : await set_alias_contact_blocked(alias_id!, contact.id, next);

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
    const response = domain_address_id
      ? await delete_domain_address_contact(domain_address_id, contact_id)
      : await delete_alias_contact(alias_id!, contact_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_contact_removed"), "success");
      set_contacts((prev) => prev.filter((c) => c.id !== contact_id));
    }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<UserGroupIcon className="w-4 h-4" />}
        info={t("settings.alias_contacts_info")}
        info_title={t("settings.alias_contacts_title")}
      >
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
              <div className="flex items-center gap-1 shrink-0">
                {contact.is_blocked && (
                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function delivery_reason_label(t: ReturnType<typeof use_i18n>["t"], reason: string): string {
  switch (reason) {
    case "sender_pin":
      return t("settings.alias_delivery_log_reason_sender_pin");
    case "alias_rule":
      return t("settings.alias_delivery_log_reason_alias_rule");
    case "alias_disabled":
      return t("settings.alias_delivery_log_reason_alias_disabled");
    default:
      return t("settings.alias_delivery_log_reason_unknown");
  }
}

function delivery_reason_icon(reason: string): React.ReactNode {
  switch (reason) {
    case "sender_pin":
      return <NoSymbolIcon className="w-4 h-4 text-red-500 shrink-0" />;
    case "alias_rule":
      return <AdjustmentsHorizontalIcon className="w-4 h-4 text-orange-500 shrink-0" />;
    case "alias_disabled":
      return <EyeSlashIcon className="w-4 h-4 text-txt-muted shrink-0" />;
    default:
      return <NoSymbolIcon className="w-4 h-4 text-txt-muted shrink-0" />;
  }
}

function format_relative_time(
  t: ReturnType<typeof use_i18n>["t"],
  iso: string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return t("settings.fam_org_time_just_now");
  if (mins < 60) return t("settings.fam_org_time_minutes", { count: mins });
  if (hours < 24)
    return hours === 1
      ? t("settings.fam_org_time_hour", { count: hours })
      : t("settings.fam_org_time_hours", { count: hours });
  return days === 1
    ? t("settings.fam_org_time_yesterday")
    : t("settings.fam_org_time_days", { count: days });
}

function DeliveryLogPanel({ alias_id, domain_address_id }: { alias_id?: string; domain_address_id?: string }) {
  const { t } = use_i18n();
  const [events, set_events] = useState<DeliveryEvent[]>([]);
  const [loading, set_loading] = useState(true);
  const [expanded, set_expanded] = useState(false);

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = domain_address_id
        ? await get_domain_address_delivery_log(domain_address_id)
        : await get_alias_delivery_log(alias_id!);

      if (response.data) {
        set_events(response.data.events ?? []);
      }
    } catch {
      set_events([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, domain_address_id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<NoSymbolIcon className="w-4 h-4" />}
        info={t("settings.alias_delivery_log_info")}
        info_title={t("settings.alias_delivery_log_title")}
      >
        {t("settings.alias_delivery_log_title")}
      </SectionTitle>

      {loading ? (
        <Spinner size="md" />
      ) : events.length === 0 ? (
        <p className="text-xs text-txt-muted">
          {t("settings.alias_delivery_log_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {(expanded ? events : events.slice(0, 3)).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary"
            >
              {delivery_reason_icon(ev.blocked_reason)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary truncate">
                  {delivery_reason_label(t, ev.blocked_reason)}
                </p>
                <p className="text-xs text-txt-muted">
                  {format_relative_time(t, ev.created_at)}
                </p>
              </div>
            </div>
          ))}
          {events.length > 3 && (
            <button
              className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
              onClick={() => set_expanded((v) => !v)}
            >
              {expanded
                ? t("common.show_less")
                : t("common.n_more", { count: events.length - 3 })}
            </button>
          )}
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

type AliasAdvancedPanelProps =
  | { alias_id: string; domain_address_id?: never; alias_local_part?: never; alias_domain?: never }
  | { alias_id?: never; domain_address_id: string; alias_local_part: string; alias_domain: string };

export function AliasAdvancedPanel({ alias_id, domain_address_id, alias_local_part, alias_domain }: AliasAdvancedPanelProps) {
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
  const rules_locked = is_feature_locked("has_alias_rules");
  const delivery_log_locked = is_feature_locked("has_advanced_aliases");
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
        <SenderPinningPanel alias_id={alias_id} domain_address_id={domain_address_id} />
      )}
      {rules_locked ? (
        <LockedSection
          icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_rules")}
          title={t("settings.alias_rules_title")}
        />
      ) : (
        <RulesPanel alias_id={alias_id} domain_address_id={domain_address_id} />
      )}
      {delivery_log_locked ? (
        <LockedSection
          icon={<NoSymbolIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_upgrade_plan")}
          title={t("settings.alias_delivery_log_title")}
        />
      ) : (
        <DeliveryLogPanel alias_id={alias_id} domain_address_id={domain_address_id} />
      )}
      {contacts_locked ? (
        <LockedSection
          icon={<UserGroupIcon className="w-4 h-4" />}
          message={t("settings.alias_feature_locked_contacts")}
          title={t("settings.alias_contacts_title")}
        />
      ) : (
        <ContactsPanel alias_id={alias_id} domain_address_id={domain_address_id} alias_local_part={alias_local_part} alias_domain={alias_domain} />
      )}
    </div>
  );
}
