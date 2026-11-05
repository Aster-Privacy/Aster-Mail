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
import { useState, type FormEvent } from "react";
import { Button } from "@aster/ui";

import type { TranslationKey } from "@/lib/i18n/types";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import {
  confirm_forwarding_code,
  resend_forwarding_confirmation,
  type ForwardingDestinationStatus,
} from "@/services/api/auto_forward";

export const FORWARDING_CODE_LENGTH = 8;

const CODE_ERROR_KEYS: Record<string, TranslationKey> = {
  FORWARDING_CODE_INVALID: "settings.forwarding_code_invalid",
  FORWARDING_CODE_EXPIRED: "settings.forwarding_code_expired",
  FORWARDING_CODE_ATTEMPTS_EXHAUSTED:
    "settings.forwarding_code_attempts_exhausted",
};

const SEND_FAILED_SERVER_CODE = "EMAIL_SEND_FAILED";

export interface DestinationUpdate {
  confirmed?: boolean;
  send_error?: string | null;
}

export type ForwardingRuleState = "active" | "paused" | "pending";

export function forwarding_rule_state(rule: {
  is_enabled: boolean;
  destinations?: ForwardingDestinationStatus[];
}): ForwardingRuleState {
  if (!rule.is_enabled) return "paused";
  const destinations = rule.destinations ?? [];

  if (destinations.length > 0 && destinations.every((d) => !d.confirmed)) {
    return "pending";
  }

  return "active";
}

export function awaiting_code_addresses(
  destinations: ForwardingDestinationStatus[] | undefined,
): string[] {
  return (destinations ?? [])
    .filter((d) => !d.confirmed && !d.send_error)
    .map((d) => d.address);
}

export function clean_forwarding_code(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, FORWARDING_CODE_LENGTH);
}

export function send_error_key(
  send_error: string | null | undefined,
): TranslationKey | null {
  if (!send_error) return null;
  if (send_error === "invalid_address" || send_error === "rejected") {
    return "settings.forwarding_send_rejected";
  }

  return "settings.forwarding_send_failed";
}

export function use_forwarding_destination_confirm(
  rule_id: string,
  address: string,
  on_changed: (update: DestinationUpdate) => void,
) {
  const { t } = use_i18n();
  const [code, set_code_raw] = useState("");
  const [code_error, set_code_error] = useState<string | null>(null);
  const [is_confirming, set_is_confirming] = useState(false);
  const [is_resending, set_is_resending] = useState(false);

  const set_code = (raw: string) => {
    set_code_raw(clean_forwarding_code(raw));
    set_code_error(null);
  };

  const can_confirm =
    code.length === FORWARDING_CODE_LENGTH && !is_confirming && !is_resending;

  const confirm = async () => {
    if (!can_confirm) return;
    set_is_confirming(true);
    set_code_error(null);
    try {
      const result = await confirm_forwarding_code(rule_id, address, code);

      if (result.data?.confirmed) {
        set_code_raw("");
        show_toast(
          t("settings.forwarding_code_confirmed", { address }),
          "success",
        );
        on_changed({ confirmed: true, send_error: null });

        return;
      }

      const key = result.server_code
        ? CODE_ERROR_KEYS[result.server_code]
        : undefined;

      set_code_error(
        key
          ? t(key)
          : result.error || t("common.something_went_wrong_try_again"),
      );
    } finally {
      set_is_confirming(false);
    }
  };

  const resend = async () => {
    set_is_resending(true);
    set_code_error(null);
    try {
      const result = await resend_forwarding_confirmation(rule_id, address);

      if (result.data?.success) {
        set_code_raw("");
        show_toast(
          t("settings.forwarding_verification_resent", { address }),
          "success",
        );
        on_changed({ send_error: null });

        return;
      }

      if (result.server_code === SEND_FAILED_SERVER_CODE) {
        show_toast(t("settings.forwarding_send_failed", { address }), "error");
        on_changed({ send_error: "send_failed" });

        return;
      }

      show_toast(
        result.error || t("common.something_went_wrong_try_again"),
        "error",
      );
    } finally {
      set_is_resending(false);
    }
  };

  return {
    code,
    set_code,
    code_error,
    is_confirming,
    is_resending,
    can_confirm,
    confirm,
    resend,
  };
}

interface PendingDestinationControlsProps {
  rule_id: string;
  destination: ForwardingDestinationStatus;
  on_changed: (update: DestinationUpdate) => void;
}

export function PendingDestinationControls({
  rule_id,
  destination,
  on_changed,
}: PendingDestinationControlsProps) {
  const { t } = use_i18n();
  const state = use_forwarding_destination_confirm(
    rule_id,
    destination.address,
    on_changed,
  );
  const error_key = send_error_key(destination.send_error);

  const handle_submit = (event: FormEvent) => {
    event.preventDefault();
    state.confirm();
  };

  return (
    <form
      className="mt-1.5 flex flex-col gap-1"
      data-testid="forwarding-pending-destination"
      onSubmit={handle_submit}
    >
      {error_key && (
        <p className="text-[11px] text-red-600 dark:text-red-500" role="alert">
          {t(error_key, { address: destination.address })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Input
          aria-label={t("settings.forwarding_enter_code", {
            address: destination.address,
          })}
          autoComplete="one-time-code"
          className="aster_input_tonal w-36"
          inputMode="numeric"
          placeholder={t("settings.forwarding_code_placeholder")}
          size="md"
          value={state.code}
          onChange={(e) => state.set_code(e.target.value)}
        />
        <Button
          disabled={!state.can_confirm}
          is_loading={state.is_confirming}
          size="sm"
          type="submit"
        >
          {t("settings.forwarding_confirm_code")}
        </Button>
        <Button
          disabled={state.is_resending || state.is_confirming}
          is_loading={state.is_resending}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => state.resend()}
        >
          {t("settings.forwarding_resend_code")}
        </Button>
      </div>
      {state.code_error && (
        <p className="text-[11px] text-red-600 dark:text-red-500" role="alert">
          {state.code_error}
        </p>
      )}
    </form>
  );
}
