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
} from "@heroicons/react/24/outline";
import { Button, } from "@aster/ui";


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

import { INPUT_CLASS, PanelRow } from "./shared";
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

