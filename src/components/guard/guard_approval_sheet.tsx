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
import type { GuardDevice } from "@/services/guard/guard_device";
import type {
  GuardApproveOutcome,
  GuardRequestView,
} from "@/services/guard/guard_approval";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  NoSymbolIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

import {
  GuardHeldToast,
  GuardPanicHost,
} from "@/components/guard/guard_held_toast";
import { open_guard_panic } from "@/components/guard/guard_panic_dialog";
import {
  GuardRescueBanner,
  GuardSetupAfterRescue,
} from "@/components/guard/guard_rescue_banner";
import {
  format_guard_countdown,
  format_guard_relative,
  GuardBrowserIcon,
  GuardChip,
  GuardDetailRow,
  GuardFlag,
  GuardIconTile,
  GuardLogo,
  GuardOsIcon,
  use_guard_now,
} from "@/components/guard/guard_visuals";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
import {
  GUARD_REQUESTS_REFRESH_EVENT,
  use_guard_requests,
} from "@/components/guard/use_guard_requests";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { OtpInput } from "@/components/ui/otp_input";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import {
  get_passphrase_from_memory,
  on_vault_stored,
} from "@/services/crypto/memory_key_store";
import {
  approve_guard_sign_in,
  deny_guard_sign_in,
} from "@/services/guard/guard_approval";
import {
  on_guard_event,
  set_guard_event_account,
  start_guard_event_bridge,
} from "@/services/guard/guard_events";

type SheetMessage =
  | "wrong_number"
  | "request_ended"
  | "unlock_first"
  | "keys_changed"
  | "error"
  | null;

const MESSAGE_KEYS = {
  wrong_number: "guard.approve_wrong_number",
  request_ended: "guard.approve_request_ended",
  unlock_first: "guard.approve_unlock_first",
  keys_changed: "guard.approve_keys_changed",
  error: "guard.approve_error",
} as const;

export function clean_guard_number_input(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

interface GuardApprovalSheetProps {
  view: GuardRequestView;
  user_id: string;
  device: GuardDevice;
  on_done: (request_id: string) => void;
  finish_delay_ms?: number;
}

function ContextDetails({
  view,
  now,
}: {
  view: GuardRequestView;
  now: number;
}) {
  const { t } = use_i18n();
  const context = view.context;

  if (!context) {
    return (
      <dl
        aria-label={t("guard.approve_request_label")}
        className="px-1"
        data-testid="guard_request_context"
      >
        <GuardDetailRow
          icon={<QuestionMarkCircleIcon />}
          label={t("guard.approve_device_label")}
          primary={t("guard.approve_unknown_device")}
        />
      </dl>
    );
  }

  const device =
    context.browser && context.os
      ? t("guard.approve_device", { browser: context.browser, os: context.os })
      : context.browser || context.os || t("guard.approve_unknown_device");
  const place = [context.city, context.country].filter(Boolean).join(", ");
  const requested_at = context.requested_at || view.summary.created_at;
  const time = format_guard_time(requested_at);

  return (
    <dl
      aria-label={t("guard.approve_request_label")}
      className="flex flex-col gap-5 px-1"
      data-testid="guard_request_context"
    >
      <GuardDetailRow
        icon={<GuardOsIcon device_type={context.device_type} os={context.os} />}
        label={t("guard.approve_device_label")}
        primary={
          <>
            {context.browser && <GuardBrowserIcon browser={context.browser} />}
            <span className="truncate">{device}</span>
          </>
        }
      />
      <GuardDetailRow
        icon={<MapPinIcon />}
        label={t("guard.approve_location_label")}
        primary={
          <>
            {place && <GuardFlag code={context.country_code} />}
            <span className="truncate">
              {place || t("guard.approve_unknown_location")}
            </span>
          </>
        }
      />
      {time && (
        <GuardDetailRow
          icon={<ClockIcon />}
          label={t("guard.approve_time_label")}
          primary={
            <span className="truncate">
              {format_guard_relative(requested_at, now)}
            </span>
          }
          secondary={time}
        />
      )}
    </dl>
  );
}

function ExpiryChip({ expires_at, now }: { expires_at: string; now: number }) {
  const { t } = use_i18n();
  const left = Date.parse(expires_at) - now;

  if (Number.isNaN(left)) return null;
  if (left <= 0) {
    return (
      <GuardChip test_id="guard_approve_expiry" tone="danger">
        {t("guard.approve_expired_chip")}
      </GuardChip>
    );
  }

  return (
    <GuardChip
      icon={<ClockIcon aria-hidden className="h-3.5 w-3.5" />}
      test_id="guard_approve_expiry"
      tone={left < 60_000 ? "warning" : "neutral"}
    >
      {t("guard.approve_expires_in", { time: format_guard_countdown(left) })}
    </GuardChip>
  );
}

function SheetResult({
  kind,
  on_close,
}: {
  kind: "approved" | "denied";
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const approved = kind === "approved";

  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center px-6 pb-6 pt-8 text-center"
      data-testid={`guard_approve_result_${kind}`}
    >
      <GuardIconTile size="lg" tone={approved ? "success" : "danger"}>
        {approved ? (
          <CheckCircleIcon className="h-7 w-7" />
        ) : (
          <NoSymbolIcon className="h-7 w-7" />
        )}
      </GuardIconTile>
      <h2 className="mt-4 text-lg font-semibold text-txt-primary">
        {t(approved ? "guard.approve_approved" : "guard.approve_denied")}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-txt-muted">
        {t(
          approved
            ? "guard.approve_approved_body"
            : "guard.approve_denied_body",
        )}
      </p>
      <Button
        className="mt-6 w-full"
        size="lg"
        variant="outline"
        onClick={on_close}
      >
        {t("common.done")}
      </Button>
    </div>
  );
}

export function GuardApprovalSheet({
  view,
  user_id,
  device,
  on_done,
  finish_delay_ms = 2400,
}: GuardApprovalSheetProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const step_up = use_guard_step_up();
  const now = use_guard_now();
  const [number, set_number] = useState("");
  const [message, set_message] = useState<SheetMessage>(null);
  const [busy, set_busy] = useState<"approve" | "deny" | null>(null);
  const [result, set_result] = useState<"approved" | "denied" | null>(null);
  const [shake, set_shake] = useState(0);
  const request_id = view.summary.id;

  useEffect(() => {
    if (message !== "unlock_first") return;

    return on_vault_stored(() => set_message(null));
  }, [message]);

  useEffect(() => {
    if (!result) return;
    if (finish_delay_ms <= 0) {
      on_done(request_id);

      return;
    }
    const timer = window.setTimeout(() => on_done(request_id), finish_delay_ms);

    return () => window.clearTimeout(timer);
  }, [result, finish_delay_ms, on_done, request_id]);

  const handle_outcome = (outcome: GuardApproveOutcome) => {
    switch (outcome.kind) {
      case "approved":
        set_result("approved");

        return;
      case "wrong_number":
        set_message("wrong_number");
        set_shake((count) => count + 1);

        return;
      case "gone":
        show_toast(t("guard.approve_request_ended"), "info");
        on_done(request_id);

        return;
      case "locked":
        set_message("unlock_first");

        return;
      case "keys_changed":
        set_message("keys_changed");

        return;
      case "canceled":
        return;
      default:
        set_message("error");
    }
  };

  const approve = async (value = number) => {
    if (busy || value.length !== 2) return;
    set_busy("approve");
    set_message(null);
    try {
      handle_outcome(
        await approve_guard_sign_in({
          request: view.summary,
          number: Number(value),
          user_id,
          device,
          request_proof: step_up.request_proof,
          read_passphrase: get_passphrase_from_memory,
        }),
      );
    } finally {
      set_busy(null);
    }
  };

  const deny = async (then_panic = false) => {
    if (busy) return;
    set_busy("deny");
    set_message(null);
    try {
      const outcome = await deny_guard_sign_in(view.summary, user_id, device);

      if (
        then_panic &&
        (outcome.kind === "denied" || outcome.kind === "gone")
      ) {
        on_done(request_id);
        open_guard_panic();
      } else if (outcome.kind === "denied") {
        set_result("denied");
      } else if (outcome.kind === "gone") {
        show_toast(t("guard.approve_request_ended"), "info");
        on_done(request_id);
      } else {
        set_message("error");
      }
    } finally {
      set_busy(null);
    }
  };

  const can_close = busy === null;

  return (
    <>
      <Modal
        close_on_escape={can_close}
        close_on_overlay={false}
        is_open
        on_close={() => on_done(request_id)}
        show_close_button={false}
        size="md"
      >
        <div data-testid="guard_approval_sheet">
          {result ? (
            <SheetResult kind={result} on_close={() => on_done(request_id)} />
          ) : (
            <>
              <ModalHeader className="items-center pe-6 text-center">
                <GuardLogo className="mb-4" />
                <ModalTitle className="text-center">
                  {t("guard.approve_title")}
                </ModalTitle>
                <ModalDescription className="text-center">
                  {t("guard.approve_description")}
                </ModalDescription>
                <div className="mt-3 flex justify-center">
                  <ExpiryChip expires_at={view.summary.expires_at} now={now} />
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-5 pb-2">
                  <ContextDetails now={now} view={view} />
                  <div className="space-y-3">
                    <p
                      className="text-center text-sm font-medium text-txt-primary"
                      id="guard_approve_number_label"
                    >
                      {t("guard.approve_number_label")}
                    </p>
                    <motion.div
                      key={shake}
                      animate={
                        shake > 0 && !reduce_motion
                          ? { x: [0, -12, 12, -8, 8, -4, 4, 0] }
                          : { x: 0 }
                      }
                      aria-labelledby="guard_approve_number_label"
                      data-testid="guard_approve_digits"
                      role="group"
                      transition={{ duration: 0.45, ease: "easeInOut" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void approve();
                      }}
                    >
                      <OtpInput
                        autofocus
                        aria_label={t("guard.approve_number_label")}
                        disabled={busy !== null}
                        id_prefix="guard_approve_digit"
                        length={2}
                        size="lg"
                        status={
                          message === "wrong_number" ? "error" : "default"
                        }
                        value={number}
                        onChange={(value) => {
                          set_number(clean_guard_number_input(value));
                          if (message === "wrong_number") set_message(null);
                        }}
                      />
                    </motion.div>
                  </div>
                  {message && (
                    <p
                      className="rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {t(MESSAGE_KEYS[message])}
                    </p>
                  )}
                </div>
              </ModalBody>
              <div className="flex flex-col gap-2 px-6 pb-5 pt-2">
                <Button
                  className="w-full"
                  disabled={busy !== null || number.length !== 2}
                  is_loading={busy === "approve"}
                  size="lg"
                  variant="depth"
                  onClick={() => void approve()}
                >
                  {t("guard.approve_confirm")}
                </Button>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  is_loading={busy === "deny"}
                  size="lg"
                  variant="depth_destructive"
                  onClick={() => void deny()}
                >
                  {t("guard.approve_deny")}
                </Button>
                <Button
                  className="w-full"
                  data-testid="guard_approve_not_me"
                  disabled={busy !== null}
                  size="lg"
                  variant="depth_destructive"
                  onClick={() => void deny(true)}
                >
                  {t("guard.not_me")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
      {step_up.step_up_modal}
    </>
  );
}

const REFRESH_EVENTS = new Set(["sign_in_request", "guard_enabled", "panic"]);

export function GuardApprovalHost({
  show_rescue_banner = false,
}: {
  show_rescue_banner?: boolean;
} = {}) {
  const { user, switch_to_account } = use_auth();
  const user_id = user?.id ?? null;
  const { requests, device, dismiss } = use_guard_requests(user_id);

  useEffect(() => {
    set_guard_event_account(user_id);
    const stop_bridge = start_guard_event_bridge();
    const stop_listening = on_guard_event((event) => {
      if (event.account_id !== user_id) {
        if (event.event === "sign_in_request") {
          void switch_to_account(event.account_id).catch(() => undefined);
        }

        return;
      }
      if (REFRESH_EVENTS.has(event.event)) {
        window.dispatchEvent(new CustomEvent(GUARD_REQUESTS_REFRESH_EVENT));
      }
    });

    return () => {
      stop_listening();
      stop_bridge();
      set_guard_event_account(null);
    };
  }, [user_id, switch_to_account]);
  const current = requests[0];

  return (
    <>
      <GuardHeldToast />
      <GuardPanicHost user_id={user_id} />
      {show_rescue_banner && (
        <div className="fixed inset-x-0 top-0 z-[60]">
          <GuardRescueBanner user_id={user_id} />
        </div>
      )}
      <GuardSetupAfterRescue user_id={user_id} />
      {current && device && user_id && (
        <GuardApprovalSheet
          key={current.summary.id}
          device={device}
          user_id={user_id}
          view={current}
          on_done={dismiss}
        />
      )}
    </>
  );
}
