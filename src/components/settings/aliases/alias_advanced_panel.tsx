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
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useEffect, useState } from "react";
import {
  TrashIcon,
  PlusIcon,
  AdjustmentsHorizontalIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  EyeSlashIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { format_created_at, format_relative_time } from "./alias_stats_format";

import { AliasRuleEditorModal } from "@/components/settings/aliases/alias_rule_editor_modal";
import { AliasWebsitesEditor } from "@/components/settings/aliases/alias_websites_editor";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_folders } from "@/hooks/use_folders";
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
  get_alias_stats,
  type DeliveryEvent,
  type AliasStats,
} from "@/services/api/aliases";

const INPUT_CLASS =
  "flex-1 min-w-0 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none";

const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_NOTE_LENGTH = 500;

function sanitize_text(value: string): string {
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

export function PanelRow({
  label,
  description,
  info,
  align_top,
  children,
}: {
  label: string;
  description?: string;
  info?: string;
  align_top?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex justify-between gap-6 py-4 ${align_top ? "items-start" : "items-center"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
          {label}
          {info && <InfoHint tip={info} title={label} />}
        </p>
        {description && (
          <p className="mt-0.5 text-sm text-txt-muted">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

function TextFieldRow({
  label,
  description,
  placeholder,
  value,
  max_length,
  too_long_message,
  success_message,
  error_message,
  is_locked,
  on_save,
  on_saved,
}: {
  label: string;
  description: string;
  placeholder: string;
  value?: string;
  max_length: number;
  too_long_message: string;
  success_message: string;
  error_message: string;
  is_locked?: boolean;
  on_save: (next: string) => Promise<{ error?: unknown }>;
  on_saved: (next: string) => void;
}) {
  const { t } = use_i18n();
  const [draft, set_draft] = useState(value ?? "");
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    set_draft(value ?? "");
  }, [value]);

  const commit = async () => {
    const cleaned = sanitize_text(draft);

    if (cleaned === (value ?? "")) {
      set_draft(cleaned);

      return;
    }

    if (cleaned.length > max_length) {
      show_toast(too_long_message, "error");

      return;
    }

    set_saving(true);
    try {
      const response = await on_save(cleaned);

      if (response.error) {
        show_toast(error_message, "error");
        set_draft(value ?? "");

        return;
      }
      on_saved(cleaned);
      show_toast(success_message, "success");
    } catch {
      show_toast(error_message, "error");
      set_draft(value ?? "");
    } finally {
      set_saving(false);
    }
  };

  return (
    <PanelRow description={description} label={label}>
      <div className="relative w-64">
        <Input
          className={`w-full pr-8${is_locked ? " pointer-events-none" : ""}`}
          disabled={saving}
          maxLength={max_length}
          placeholder={placeholder}
          readOnly={is_locked}
          size="md"
          tabIndex={is_locked ? -1 : undefined}
          value={draft}
          onBlur={commit}
          onChange={(event) => set_draft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              set_draft(value ?? "");
            }
          }}
        />
        {saving && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <Spinner className="text-txt-muted" size="xs" />
          </span>
        )}
        {is_locked && (
          <button
            aria-label={t("settings.feature_requires_upgrade")}
            className="absolute inset-0 cursor-pointer rounded-[12px]"
            type="button"
            onClick={() =>
              prompt_upgrade(t("settings.feature_requires_upgrade"))
            }
          />
        )}
      </div>
    </PanelRow>
  );
}

export function SenderPinningPanel({
  alias_id,
  domain_address_id,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [mode, set_mode] = useState<SenderPinMode>(SENDER_PIN_MODE_OFF);
  const [pins, set_pins] = useState<DecryptedAliasPin[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
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
  }, [alias_id, domain_address_id, locked, t]);

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

  const active_mode_hint = modes.find((m) => m.value === mode)?.hint ?? "";

  return (
    <div className="divide-y divide-edge-secondary">
      <PanelRow
        description={active_mode_hint}
        info={t("settings.alias_sender_pinning_info")}
        label={t("settings.alias_sender_pin_mode_label")}
      >
        <Select
          value={String(mode)}
          onValueChange={(v) => change_mode(Number(v) as SenderPinMode)}
        >
          <SelectTrigger className="h-9 w-64 shrink-0 bg-transparent">
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
      </PanelRow>

      {mode === SENDER_PIN_MODE_ALLOWLIST && (
        <div className="space-y-2 pt-4">
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

function field_label(
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

export function ContactsPanel({
  alias_id,
  domain_address_id,
  alias_local_part,
  alias_domain,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  alias_local_part?: string;
  alias_domain?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [contacts, set_contacts] = useState<DecryptedAliasContact[]>([]);
  const [loading, set_loading] = useState(true);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);
  const [readable_reverse, set_readable_reverse] = useState(false);

  useEffect(() => {
    if (locked) return;
    get_alias_preferences()
      .then((r) => {
        if (r.data?.readable_reverse_aliases) set_readable_reverse(true);
      })
      .catch(() => {});
  }, [locked]);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
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
  }, [alias_id, domain_address_id, locked, t]);

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
        ? await add_domain_address_contact(
            domain_address_id,
            value,
            alias_local_part ?? "",
            alias_domain ?? "",
          )
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
      ? await set_domain_address_contact_blocked(
          domain_address_id,
          contact.id,
          next,
        )
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

function delivery_reason_label(
  t: ReturnType<typeof use_i18n>["t"],
  reason: string,
): string {
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
      return (
        <AdjustmentsHorizontalIcon className="w-4 h-4 text-orange-500 shrink-0" />
      );
    case "alias_disabled":
      return <EyeSlashIcon className="w-4 h-4 text-txt-muted shrink-0" />;
    default:
      return <NoSymbolIcon className="w-4 h-4 text-txt-muted shrink-0" />;
  }
}

export function DeliveryLogPanel({
  alias_id,
  domain_address_id,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [events, set_events] = useState<DeliveryEvent[]>([]);
  const [loading, set_loading] = useState(true);
  const [expanded, set_expanded] = useState(false);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
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
  }, [alias_id, domain_address_id, locked]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
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

export function StatsPanel({
  alias_id,
  hide_created,
  locked,
}: {
  alias_id: string;
  hide_created?: boolean;
  locked?: boolean;
}) {
  const { t, language } = use_i18n();
  const [stats, set_stats] = useState<AliasStats | null>(null);
  const [last_sender, set_last_sender] = useState<string | null>(null);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    if (locked) {
      set_loading(false);

      return;
    }
    let active = true;

    set_loading(true);
    set_last_sender(null);
    get_alias_stats(alias_id)
      .then(async (stats_response) => {
        if (!active || !stats_response.data) return;
        set_stats(stats_response.data);

        const { last_sender_encrypted, last_sender_nonce } =
          stats_response.data;

        if (!last_sender_encrypted) return;

        const envelope = await decrypt_mail_envelope<{
          from: { name: string; email: string };
        }>(last_sender_encrypted, last_sender_nonce ?? "");

        if (active && envelope?.from?.email)
          set_last_sender(envelope.from.email);
      })
      .catch(() => {})
      .finally(() => {
        if (active) set_loading(false);
      });

    return () => {
      active = false;
    };
  }, [alias_id, locked]);

  if (loading) {
    return <Spinner size="sm" />;
  }

  if (!stats) return null;

  const created_label = format_created_at(stats.created_at, language);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-txt-muted">
        <span>
          {t("settings.alias_stats_received" as TranslationKey, {
            count: stats.received,
          })}
        </span>
        <span>
          {t("settings.alias_stats_forwarded" as TranslationKey, {
            count: stats.forwarded,
          })}
        </span>
        <span>
          {t("settings.alias_stats_blocked" as TranslationKey, {
            count: stats.blocked,
          })}
        </span>
        <span>
          {t("settings.alias_stats_replied" as TranslationKey, {
            count: stats.replied ?? 0,
          })}
        </span>
      </div>

      {last_sender && stats.last_sender_at && (
        <div className="flex items-center gap-1.5 text-sm text-txt-muted">
          <PaperAirplaneIcon className="w-4 h-4 shrink-0" />
          <span className="break-all">{last_sender}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="whitespace-nowrap">
            {format_relative_time(t, stats.last_sender_at)}
          </span>
        </div>
      )}

      {created_label && !hide_created && (
        <div className="text-sm text-txt-muted">
          {t("settings.alias_stats_created" as TranslationKey, {
            date: created_label,
          })}
        </div>
      )}
    </div>
  );
}

export interface AliasDeliveryUpdate {
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
}

export interface AliasDeliveryState {
  never_inbox: boolean;
  delivery_folder_token: string | null;
}

const DELIVERY_INBOX_VALUE = "__inbox__";
const DELIVERY_ARCHIVE_VALUE = "__archive__";

export function DeliveryPanel({
  never_inbox,
  delivery_folder_token,
  on_save,
  on_saved,
}: {
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  on_save: (next: AliasDeliveryUpdate) => Promise<{ error?: unknown }>;
  on_saved: (next: AliasDeliveryState) => void;
}) {
  const { t } = use_i18n();
  const { state: folders_state, fetch_folders } = use_folders();
  const [value, set_value] = useState(
    delivery_folder_token ||
      (never_inbox ? DELIVERY_ARCHIVE_VALUE : DELIVERY_INBOX_VALUE),
  );
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    void fetch_folders();
  }, [fetch_folders]);

  const custom_folders = folders_state.folders.filter(
    (folder) =>
      folder.folder_type === "folder" || folder.folder_type === "custom",
  );

  const is_missing_folder =
    !!delivery_folder_token &&
    value === delivery_folder_token &&
    !folders_state.is_loading &&
    !custom_folders.some(
      (folder) => folder.folder_token === delivery_folder_token,
    );

  const handle_change = async (next: string) => {
    const previous = value;

    set_value(next);
    set_saving(true);

    const update: AliasDeliveryUpdate =
      next === DELIVERY_ARCHIVE_VALUE
        ? { never_inbox: true }
        : next === DELIVERY_INBOX_VALUE
          ? { delivery_folder_token: null }
          : { delivery_folder_token: next };

    const response = await on_save(update);

    set_saving(false);
    if (response.error) {
      set_value(previous);
      show_toast(t("settings.alias_delivery_folder_error"), "error");

      return;
    }
    on_saved({
      never_inbox: next === DELIVERY_ARCHIVE_VALUE,
      delivery_folder_token:
        next === DELIVERY_ARCHIVE_VALUE || next === DELIVERY_INBOX_VALUE
          ? null
          : next,
    });
  };

  return (
    <div className="divide-y divide-edge-secondary">
      <PanelRow
        description={t("settings.alias_delivery_folder_desc")}
        info={t("settings.alias_delivery_folder_info")}
        label={t("settings.alias_delivery_folder")}
      >
        <Select disabled={saving} value={value} onValueChange={handle_change}>
          <SelectTrigger
            aria-label={t("settings.alias_delivery_folder")}
            className="h-9 w-64 shrink-0 bg-transparent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DELIVERY_INBOX_VALUE}>
              {t("mail.inbox")}
            </SelectItem>
            <SelectItem value={DELIVERY_ARCHIVE_VALUE}>
              {t("mail.archive")}
            </SelectItem>
            {custom_folders.map((folder) => (
              <SelectItem key={folder.folder_token} value={folder.folder_token}>
                {folder.name}
              </SelectItem>
            ))}
            {is_missing_folder && (
              <SelectItem value={delivery_folder_token}>
                {t("settings.alias_delivery_folder_missing")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </PanelRow>
    </div>
  );
}

export interface AliasDetailsProps {
  alias_address: string;
  alias_address_hash?: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  is_locked?: boolean;
  on_save_display_name: (next: string) => Promise<{ error?: unknown }>;
  on_saved_display_name: (next: string) => void;
  on_save_note: (next: string) => Promise<{ error?: unknown }>;
  on_saved_note: (next: string) => void;
  on_save_websites: (next: string[]) => Promise<{ error?: unknown }>;
  on_saved_websites: (next: string[]) => void;
}

export function AliasDetailsPanel({
  alias_address,
  display_name,
  note,
  websites,
  is_locked,
  on_save_display_name,
  on_saved_display_name,
  on_save_note,
  on_saved_note,
  on_save_websites,
  on_saved_websites,
}: AliasDetailsProps) {
  const { t } = use_i18n();

  return (
    <div className="divide-y divide-edge-secondary">
      <TextFieldRow
        description={t("settings.alias_display_name_desc")}
        error_message={t("common.failed_update_alias_display_name")}
        is_locked={is_locked}
        label={t("settings.alias_display_name_label")}
        max_length={MAX_DISPLAY_NAME_LENGTH}
        on_save={on_save_display_name}
        on_saved={on_saved_display_name}
        placeholder={t("common.add_display_name_placeholder")}
        success_message={t("common.alias_display_name_updated")}
        too_long_message={t("common.display_name_too_long")}
        value={display_name}
      />
      <TextFieldRow
        description={t("settings.alias_note_desc")}
        error_message={t("common.failed_update_alias_note")}
        label={t("settings.alias_note_label")}
        max_length={MAX_NOTE_LENGTH}
        on_save={on_save_note}
        on_saved={on_saved_note}
        placeholder={t("common.add_alias_note_placeholder")}
        success_message={t("common.alias_note_updated")}
        too_long_message={t("common.alias_note_too_long")}
        value={note}
      />
      <PanelRow
        align_top
        description={t("settings.alias_websites_desc")}
        label={t("common.websites")}
      >
        <div className="w-64 [&>button]:!mt-0 [&>div]:!mt-0">
          <AliasWebsitesEditor
            hide_icon
            alias_address={alias_address}
            on_save={on_save_websites}
            on_saved={on_saved_websites}
            websites={websites}
          />
        </div>
      </PanelRow>
    </div>
  );
}
