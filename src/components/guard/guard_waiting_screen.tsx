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
import type { GuardSignInState } from "@/services/guard/guard_sign_in";

import { useState } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";

import { GuardCodeEntry } from "@/components/guard/guard_code_entry";
import {
  format_guard_countdown,
  GuardChip,
  GuardLogo,
  GuardResultView,
  use_guard_now,
} from "@/components/guard/guard_visuals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { GuardRescueProgress } from "@/pages/guard/guard_rescue_form";

export function format_guard_time(iso: string): string {
  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) return "";

  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function format_guard_short_time(iso: string): string {
  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) return "";

  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface GuardRescueEntryProps {
  has_error: boolean;
  on_submit: (code: string) => Promise<boolean>;
}

export function GuardRescueEntry({ has_error, on_submit }: GuardRescueEntryProps) {
  const { t } = use_i18n();
  const [value, set_value] = useState("");
  const [is_busy, set_is_busy] = useState(false);

  const submit = async () => {
    if (is_busy) return;
    set_is_busy(true);
    try {
      const ok = await on_submit(value);

      if (ok) set_value("");
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="guard_rescue_entry">
      <label
        className="block text-sm font-medium text-txt-primary"
        htmlFor="guard_rescue_input"
      >
        {t("guard.sign_in_rescue_label")}
      </label>
      <p className="text-xs text-txt-muted">{t("guard.sign_in_rescue_hint")}</p>
      <Input
        autoCapitalize="characters"
        autoComplete="off"
        className="font-mono"
        disabled={is_busy}
        id="guard_rescue_input"
        spellCheck={false}
        status={has_error ? "error" : "default"}
        type="text"
        value={value}
        onChange={(e) => set_value(e.target.value)}
      />
      {has_error && (
        <p className="text-sm text-center text-red-500" role="alert">
          {t("guard.sign_in_rescue_invalid")}
        </p>
      )}
      <Button
        className="w-full"
        disabled={value.trim().length === 0}
        is_loading={is_busy}
        variant="outline"
        onClick={() => void submit()}
      >
        {t("guard.sign_in_rescue_submit")}
      </Button>
    </div>
  );
}

interface GuardWaitingScreenProps {
  state: GuardSignInState;
  on_submit_code: (code: string) => Promise<void>;
  on_start_rescue: (code: string) => Promise<boolean>;
  on_back: () => void;
}

function NumberCard({
  number,
  expires_at,
}: {
  number: number;
  expires_at: string | null;
}) {
  const { t } = use_i18n();
  const now = use_guard_now();
  const left = expires_at ? Date.parse(expires_at) - now : Number.NaN;
  const digits = String(number).padStart(2, "0").split("");

  return (
    <div className="rounded-2xl border border-edge-primary bg-surf-primary px-6 py-6 text-center shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
        {t("guard.sign_in_number_label")}
      </p>
      <p
        aria-label={t("guard.sign_in_number_label")}
        className="mt-3 flex justify-center gap-3"
        data-testid="guard_number"
      >
        {digits.map((digit, index) => (
          <span
            key={index}
            className="flex h-[76px] w-16 items-center justify-center rounded-2xl border-2 border-brand/40 bg-brand/5 text-4xl font-semibold tabular-nums text-txt-primary"
          >
            {digit}
          </span>
        ))}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <GuardChip
          icon={
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
          }
          tone="brand"
        >
          {t("guard.sign_in_waiting_chip")}
        </GuardChip>
        {!Number.isNaN(left) && left > 0 && (
          <GuardChip icon={<ClockIcon aria-hidden className="h-3.5 w-3.5" />}>
            {t("guard.approve_expires_in", { time: format_guard_countdown(left) })}
          </GuardChip>
        )}
      </div>
    </div>
  );
}

const ENDED_TITLES = {
  denied: "guard.sign_in_denied_title",
  expired: "guard.sign_in_expired_title",
  error: "guard.sign_in_error_title",
} as const;

function EndedState({
  kind,
  message,
  on_back,
}: {
  kind: keyof typeof ENDED_TITLES;
  message: string;
  on_back: () => void;
}) {
  const { t } = use_i18n();

  return (
    <GuardResultView
      actions={
        <Button className="w-full" size="lg" variant="depth" onClick={on_back}>
          {t("guard.sign_in_back")}
        </Button>
      }
      body={message}
      test_id={`guard_sign_in_ended_${kind}`}
      title={t(ENDED_TITLES[kind])}
    />
  );
}

export function GuardWaitingScreen({
  state,
  on_submit_code,
  on_start_rescue,
  on_back,
}: GuardWaitingScreenProps) {
  const { t } = use_i18n();
  const [mode, set_mode] = useState<"approve" | "code" | "rescue">("approve");

  const header = (
    <div className="text-center mb-6">
      <GuardLogo className="mb-6" />
      <h2 className="text-xl font-semibold mb-2 text-txt-primary">
        {t("guard.sign_in_waiting_title")}
      </h2>
      <p className="text-sm text-txt-muted">
        {t("guard.sign_in_waiting_description")}
      </p>
    </div>
  );

  const ended =
    state.phase === "denied" ||
    state.phase === "expired" ||
    state.phase === "error" ||
    state.phase === "rescue";
  let body: JSX.Element;

  if (state.phase === "denied") {
    body = (
      <EndedState kind="denied" message={t("guard.sign_in_denied")} on_back={on_back} />
    );
  } else if (state.phase === "expired") {
    body = (
      <EndedState kind="expired" message={t("guard.sign_in_expired")} on_back={on_back} />
    );
  } else if (state.phase === "error") {
    body = (
      <EndedState kind="error" message={t("guard.sign_in_error")} on_back={on_back} />
    );
  } else if (state.phase === "rescue") {
    body = <GuardRescueProgress rescue={state.rescue} on_back={on_back} />;
  } else if (state.phase === "starting" || state.number === null) {
    body = (
      <p className="text-sm text-center text-txt-muted" role="status">
        {t("guard.sign_in_starting")}
      </p>
    );
  } else {
    body = (
      <div className="space-y-5">
        <NumberCard expires_at={state.expires_at} number={state.number} />
        <p className="text-sm text-center text-txt-muted">
          {t("guard.sign_in_match_number")}
        </p>
        {state.phase === "paused" && (
          <p
            className="rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {t("guard.sign_in_paused")}
          </p>
        )}
        {state.phase === "completing" && (
          <p className="text-sm text-center text-txt-muted" role="status">
            {t("guard.sign_in_completing")}
          </p>
        )}
        {mode === "code" && (
          <GuardCodeEntry
            disabled={state.phase === "completing"}
            has_error={state.code_error}
            on_submit={on_submit_code}
          />
        )}
        {mode === "rescue" && (
          <GuardRescueEntry
            has_error={state.rescue_error}
            on_submit={on_start_rescue}
          />
        )}
        <div className="flex flex-col items-center gap-2 pt-1">
          {mode !== "code" && (
            <button
              className="text-sm font-medium text-txt-accent hover:underline"
              type="button"
              onClick={() => set_mode("code")}
            >
              {t("guard.sign_in_use_code")}
            </button>
          )}
          {mode !== "rescue" && (
            <button
              className="text-sm text-txt-muted hover:underline"
              type="button"
              onClick={() => set_mode("rescue")}
            >
              {t("guard.sign_in_use_rescue")}
            </button>
          )}
          <button
            className="text-sm text-txt-muted hover:underline"
            type="button"
            onClick={on_back}
          >
            {t("guard.sign_in_back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto" data-testid="guard_waiting_screen">
      {!ended && header}
      {body}
    </div>
  );
}
