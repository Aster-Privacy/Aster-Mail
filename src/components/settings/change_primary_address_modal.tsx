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
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  AtSymbolIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  KeyIcon,
  LockClosedIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp_input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import { use_auth } from "@/contexts/auth_context";
import { get_user_salt } from "@/services/api/auth";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import {
  clear_aliases_cache,
  ensure_aliases_and_domains_loaded,
  get_cached_aliases,
} from "@/components/settings/hooks/use_aliases";
import {
  start_primary_address_change,
  resend_primary_address_code,
  check_primary_address_availability,
  confirm_primary_address_change,
  load_primary_address_eligibility,
  type PrimaryAddressEligibility,
} from "@/services/api/primary_address";
import { normalize_local_part } from "@/services/api/aliases/crypto";
import { republish_identity_with_new_address } from "@/services/pgp_uid_service";
import { clamp_password } from "@/services/sanitize";
import { is_composing } from "@/utils/ime";
import { apply_input_transform } from "@/utils/input_transform";
import { ignore_error } from "@/lib/ignore_error";
import { format_date } from "@/utils/date_format";

const PRIMARY_DOMAINS = ["astermail.org", "aster.cx"];
const CODE_LENGTH = 6;
const REPUBLISH_TIMEOUT_MS = 30000;

const with_timeout = async (
  task: Promise<boolean>,
  timeout_ms: number,
): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeout_ms);
  });

  try {
    return await Promise.race([task, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const RESEND_COOLDOWN_SECONDS = 60;

type Step = "intro" | "pick" | "review" | "password" | "code" | "done";

interface ChangePrimaryAddressModalProps {
  is_open: boolean;
  on_close: () => void;
  eligibility: PrimaryAddressEligibility;
  on_changed: (new_address: string) => void | Promise<void>;
}

function IntroPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string | null;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-txt-muted">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        {body && <p className="text-sm mt-0.5 text-txt-secondary">{body}</p>}
      </div>
    </div>
  );
}

function confirm_error_key(
  server_code: string | undefined,
  code: string | undefined,
): TranslationKey {
  if (server_code === "INVALID_CREDENTIALS") {
    return "settings.address_change_code_invalid";
  }

  if (server_code === "RATE_LIMIT_EXCEEDED" || code === "RATE_LIMIT_EXCEEDED") {
    return "settings.address_change_code_too_many";
  }

  if (server_code === "NOT_FOUND" || code === "NOT_FOUND") {
    return "settings.address_change_code_expired";
  }

  if (
    server_code === "ADDRESS_IN_USE" ||
    server_code === "USERNAME_IN_USE" ||
    code === "CONFLICT"
  ) {
    return "settings.address_change_taken_now";
  }

  if (server_code === "PLAN_LIMIT_EXCEEDED") {
    return "settings.address_change_locked_plan";
  }

  if (server_code === "FORBIDDEN" || code === "FORBIDDEN") {
    return "settings.address_change_not_eligible";
  }

  if (server_code === "VALIDATION_ERROR" || code === "VALIDATION_ERROR") {
    return "settings.address_change_invalid_address";
  }

  return "settings.address_change_failed";
}

function request_error_key(
  server_code: string | undefined,
  code: string | undefined,
  is_resend: boolean,
): TranslationKey {
  if (server_code === "INVALID_CREDENTIALS" || code === "UNAUTHORIZED") {
    return "settings.address_change_password_wrong";
  }

  if (server_code === "PLAN_LIMIT_EXCEEDED") {
    return "settings.address_change_locked_plan";
  }

  if (server_code === "FORBIDDEN" || code === "FORBIDDEN") {
    return "settings.address_change_not_eligible";
  }

  if (server_code === "RATE_LIMIT_EXCEEDED" || code === "RATE_LIMIT_EXCEEDED") {
    return is_resend
      ? "settings.address_change_resend_too_soon"
      : "settings.address_change_too_many_requests";
  }

  if (
    server_code === "ADDRESS_IN_USE" ||
    server_code === "USERNAME_IN_USE" ||
    code === "CONFLICT"
  ) {
    return "settings.address_change_taken_now";
  }

  if (server_code === "EMAIL_SEND_FAILED") {
    return "settings.address_change_send_failed";
  }

  if (server_code === "NOT_FOUND" || code === "NOT_FOUND") {
    return "settings.address_change_code_expired";
  }

  if (server_code === "VALIDATION_ERROR" || code === "VALIDATION_ERROR") {
    return "settings.address_change_invalid_address";
  }

  return "settings.address_change_failed";
}

const PRIMARY_LOCAL_PART_MIN = 3;
const PRIMARY_LOCAL_PART_MAX = 40;
const PRIMARY_LOCAL_PART_TYPED_MAX = 64;

function validate_primary_local_part(local_part: string): {
  valid: boolean;
  error_key?: TranslationKey;
} {
  const typed = local_part.trim().toLowerCase();

  const stripped = typed.replace(/\./g, "");

  if (
    typed.length === 0 ||
    typed.length > PRIMARY_LOCAL_PART_TYPED_MAX ||
    typed.includes("..") ||
    typed.startsWith(".") ||
    typed.endsWith(".") ||
    !/^[a-z0-9.]+$/.test(typed) ||
    stripped.length < PRIMARY_LOCAL_PART_MIN ||
    stripped.length > PRIMARY_LOCAL_PART_MAX
  ) {
    return { valid: false, error_key: "settings.address_change_name_rule" };
  }

  return { valid: true };
}

function routing_form(address: string): string {
  const at = address.lastIndexOf("@");

  if (at <= 0) return address.toLowerCase();

  return `${normalize_local_part(address.slice(0, at))}@${address
    .slice(at + 1)
    .toLowerCase()}`;
}

export function ChangePrimaryAddressModal({
  is_open,
  on_close,
  eligibility,
  on_changed,
}: ChangePrimaryAddressModalProps) {
  const { t } = use_i18n();
  const { user } = use_auth();

  const current_address = eligibility.current_address;

  const [step, set_step] = useState<Step>("intro");
  const [local_part, set_local_part] = useState("");
  const [domain, set_domain] = useState(PRIMARY_DOMAINS[0]);
  const [checking, set_checking] = useState(false);
  const [is_available, set_is_available] = useState<boolean | null>(null);
  const [check_failed, set_check_failed] = useState(false);
  const [partial, set_partial] = useState(false);
  const [confirm_text, set_confirm_text] = useState("");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [code, set_code] = useState("");
  const [busy, set_busy] = useState(false);
  const [resend_seconds, set_resend_seconds] = useState(0);
  const [code_locked, set_code_locked] = useState(false);
  const [status, set_status] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [alias_addresses, set_alias_addresses] = useState<string[]>([]);

  const availability_request_ref = useRef(0);
  const check_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const new_address = `${local_part}@${domain}`;
  const [final_address, set_final_address] = useState("");
  const [retained_address, set_retained_address] = useState("");
  const [next_change_after, set_next_change_after] = useState<string | null>(
    null,
  );
  const validation = validate_primary_local_part(local_part);

  const eligible_aliases = useMemo(
    () =>
      alias_addresses.filter((address) => {
        const at = address.lastIndexOf("@");

        return (
          at > 0 &&
          PRIMARY_DOMAINS.includes(address.slice(at + 1).toLowerCase()) &&
          address.toLowerCase() !== current_address.toLowerCase() &&
          validate_primary_local_part(address.slice(0, at).toLowerCase()).valid
        );
      }),
    [alias_addresses, current_address],
  );

  const next_change_line = useMemo(() => {
    const raw = eligibility.next_change_available_at;
    const parsed = raw ? new Date(raw) : null;

    if (!parsed || Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      return t("settings.address_change_once_unknown");
    }

    return t("settings.address_change_once_body", {
      date: format_date(parsed),
    });
  }, [eligibility.next_change_available_at, t]);

  const done_change_line = useMemo(() => {
    const parsed = next_change_after ? new Date(next_change_after) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return null;
    }

    return t("settings.address_change_locked_cooldown", {
      date: format_date(parsed),
    });
  }, [next_change_after, t]);

  useEffect(() => {
    if (!is_open) return;

    let cancelled = false;

    ensure_aliases_and_domains_loaded()
      .then(() => {
        if (cancelled) return;
        set_alias_addresses(
          get_cached_aliases()
            .filter(
              (alias) =>
                alias.is_enabled &&
                !alias.decryption_failed &&
                !alias.is_retained_primary,
            )
            .map((alias) => alias.full_address),
        );
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/change_primary_address_modal:aliases",
          caught,
        ),
      );

    return () => {
      cancelled = true;
    };
  }, [is_open]);

  useEffect(() => {
    set_step("intro");
    set_local_part("");
    set_domain(PRIMARY_DOMAINS[0]);
    set_checking(false);
    set_is_available(null);
    set_check_failed(false);
    set_partial(false);
    set_confirm_text("");
    set_password("");
    set_show_password(false);
    set_code("");
    set_busy(false);
    set_resend_seconds(0);
    set_code_locked(false);
    set_status(null);
    set_error(null);
    set_alias_addresses([]);
    set_final_address("");
    set_retained_address("");
    set_next_change_after(null);
    availability_request_ref.current += 1;
  }, [is_open]);

  const check_availability = useCallback(async (lp: string, d: string) => {
    if (!validate_primary_local_part(lp).valid) return;

    const request_id = ++availability_request_ref.current;

    set_checking(true);
    try {
      const response = await check_primary_address_availability(lp, d);

      if (request_id !== availability_request_ref.current) return;
      set_is_available(response.data ? response.data.available : null);
      set_check_failed(!response.data);
    } catch (caught) {
      ignore_error(
        "components/settings/change_primary_address_modal:check",
        caught,
      );
      if (request_id !== availability_request_ref.current) return;
      set_is_available(null);
      set_check_failed(true);
    } finally {
      if (request_id === availability_request_ref.current) set_checking(false);
    }
  }, []);

  useEffect(() => {
    if (check_timeout_ref.current) clearTimeout(check_timeout_ref.current);

    availability_request_ref.current += 1;
    set_is_available(null);
    set_check_failed(false);
    set_checking(false);

    check_timeout_ref.current = setTimeout(() => {
      void check_availability(local_part, domain);
    }, 400);

    return () => {
      if (check_timeout_ref.current) clearTimeout(check_timeout_ref.current);
    };
  }, [local_part, domain, check_availability]);

  const new_address_is_existing_alias = alias_addresses.some(
    (address) => routing_form(address) === routing_form(new_address),
  );

  const pick_alias = (address: string) => {
    const at = address.lastIndexOf("@");

    set_local_part(address.slice(0, at).toLowerCase());
    set_domain(address.slice(at + 1).toLowerCase());
  };

  const is_same_as_current =
    `${local_part.toLowerCase().replace(/\./g, "")}@${domain.toLowerCase()}` ===
    current_address.toLowerCase().replace(/\.(?=[^@]*@)/g, "");

  const can_continue_from_pick =
    local_part.length > 0 &&
    validation.valid &&
    !checking &&
    !is_same_as_current &&
    is_available === true;

  const can_continue_from_review =
    confirm_text.trim().toLowerCase() === new_address.toLowerCase();

  const handle_start = async () => {
    if (!password || !user?.email || busy) return;

    set_busy(true);
    set_error(null);
    set_status(t("settings.verifying_credentials"));

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_password("");
        set_error(t("settings.failed_verify_credentials"));

        return;
      }

      const { hash: password_hash } = await derive_password_hash(
        clamp_password(password),
        base64_to_array(salt_response.data.salt),
      );

      const response = await start_primary_address_change({
        new_local_part: local_part,
        new_domain: domain,
        password_hash,
      });

      if (response.error || !response.data) {
        set_password("");
        set_error(
          t(request_error_key(response.server_code, response.code, false)),
        );

        return;
      }

      set_password("");
      set_code("");
      set_code_locked(false);
      set_resend_seconds(RESEND_COOLDOWN_SECONDS);
      set_step("code");
    } catch (caught) {
      ignore_error(
        "components/settings/change_primary_address_modal:start",
        caught,
      );
      set_password("");
      set_error(t("settings.address_change_failed"));
    } finally {
      set_busy(false);
      set_status(null);
    }
  };

  useEffect(() => {
    if (resend_seconds <= 0) return;

    const timer = window.setTimeout(() => {
      set_resend_seconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resend_seconds]);

  const handle_resend = async () => {
    if (busy || resend_seconds > 0 || code_locked) return;

    set_busy(true);
    set_error(null);
    set_status(null);

    try {
      const response = await resend_primary_address_code();

      if (response.error) {
        set_error(
          t(request_error_key(response.server_code, response.code, true)),
        );

        return;
      }

      set_resend_seconds(RESEND_COOLDOWN_SECONDS);
      set_code("");
      set_status(t("settings.address_change_code_resent"));
    } catch (caught) {
      ignore_error(
        "components/settings/change_primary_address_modal:resend",
        caught,
      );
      set_error(t("settings.address_change_failed"));
    } finally {
      set_busy(false);
    }
  };

  const handle_confirm = async () => {
    if (code.length !== CODE_LENGTH || busy || code_locked) return;

    set_busy(true);
    set_error(null);
    set_status(null);

    let confirmed_address: string;

    try {
      const response = await confirm_primary_address_change({
        code,
        new_address,
        retained_address: current_address,
      });

      if (response.error || !response.data) {
        const locked =
          response.server_code === "RATE_LIMIT_EXCEEDED" ||
          response.code === "RATE_LIMIT_EXCEEDED";

        set_code_locked(locked);
        set_error(t(confirm_error_key(response.server_code, response.code)));
        set_busy(false);

        return;
      }

      confirmed_address = response.data.new_address;
      set_next_change_after(response.data.next_change_available_at ?? null);
    } catch (caught) {
      ignore_error(
        "components/settings/change_primary_address_modal:confirm",
        caught,
      );

      const settled = await load_primary_address_eligibility();
      const settled_address = settled.data?.current_address;

      if (
        settled_address &&
        settled_address.toLowerCase() === new_address.toLowerCase()
      ) {
        confirmed_address = settled.data?.current_address ?? new_address;
        set_next_change_after(settled.data?.next_change_available_at ?? null);
      } else {
        set_error(t("settings.address_change_failed"));
        set_busy(false);

        return;
      }
    }

    set_status(t("settings.address_change_updating_key"));

    try {
      const republished = await with_timeout(
        republish_identity_with_new_address(
          confirmed_address,
          user?.display_name || "",
        ),
        REPUBLISH_TIMEOUT_MS,
      );

      set_partial(!republished);
    } catch (caught) {
      ignore_error(
        "components/settings/change_primary_address_modal:republish",
        caught,
      );
      set_partial(true);
    }

    clear_aliases_cache();
    set_code("");
    set_status(null);
    set_busy(false);
    set_final_address(confirmed_address);
    set_retained_address(current_address);
    set_step("done");
    void Promise.resolve(on_changed(confirmed_address)).catch(() => {});
  };

  const request_close = useCallback(() => {
    if (busy) return;

    on_close();
  }, [busy, on_close]);

  const error_line = error && (
    <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-red-500">
      <XCircleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span className="break-words">{error}</span>
    </p>
  );

  return (
    <Modal
      is_open={is_open}
      on_close={request_close}
      size="lg"
      show_close_button={!busy}
      close_on_overlay={!busy}
      close_on_escape={!busy}
    >
      <ModalHeader>
        <ModalTitle>
          {step === "done"
            ? t("settings.address_change_done_title", {
                email: final_address || new_address,
              })
            : step === "review"
              ? t("settings.address_change_review_title")
              : t("settings.address_change_title")}
        </ModalTitle>
        {step === "intro" && (
          <ModalDescription>
            {t("settings.address_change_intro_lead")}
          </ModalDescription>
        )}
      </ModalHeader>

      {step === "intro" && (
        <>
          <ModalBody className="space-y-4">
            <IntroPoint
              body={t("settings.address_change_keep_old_body")}
              icon={<InboxArrowDownIcon className="w-5 h-5" />}
              title={t("settings.address_change_keep_old_title", {
                email: current_address,
              })}
            />
            <IntroPoint
              body={t("settings.address_change_no_limit_body")}
              icon={<CheckCircleIcon className="w-5 h-5" />}
              title={t("settings.address_change_no_limit_title")}
            />
            <IntroPoint
              body={next_change_line}
              icon={<ArrowPathIcon className="w-5 h-5" />}
              title={t("settings.address_change_once_title")}
            />
            <IntroPoint
              body={t("settings.address_change_permanent_body", {
                email: current_address,
              })}
              icon={<ExclamationTriangleIcon className="w-5 h-5" />}
              title={t("settings.address_change_permanent_title")}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={on_close}>
              {t("common.cancel")}
            </Button>
            <Button variant="depth" onClick={() => set_step("pick")}>
              {t("common.continue")}
            </Button>
          </ModalFooter>
        </>
      )}

      {step === "pick" && (
        <>
          <ModalBody className="space-y-5">
            {eligible_aliases.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-txt-primary">
                  {t("settings.address_change_use_alias")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {eligible_aliases.map((address) => (
                    <button
                      key={address}
                      className={`h-9 px-3 rounded-lg border text-sm transition-colors ${
                        new_address.toLowerCase() === address.toLowerCase()
                          ? "border-accent-primary text-txt-primary"
                          : "border-edge-secondary text-txt-secondary hover:bg-surf-hover"
                      }`}
                      type="button"
                      onClick={() => pick_alias(address)}
                    >
                      {address}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                className="block mb-2 text-sm font-medium text-txt-primary"
                htmlFor="primary-address-local-part"
              >
                {eligible_aliases.length > 0
                  ? t("settings.address_change_use_new")
                  : t("settings.address_change_pick_title")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`flex-1 min-w-0 h-10 px-3 rounded-lg bg-transparent border text-sm text-txt-primary placeholder:text-txt-muted outline-none ${
                    local_part && !validation.valid
                      ? "border-red-500"
                      : is_available === true
                        ? "border-green-500"
                        : is_available === false
                          ? "border-red-500"
                          : "border-edge-secondary"
                  }`}
                  id="primary-address-local-part"
                  placeholder={t("settings.address_change_name_placeholder")}
                  spellCheck={false}
                  value={local_part}
                  onChange={(e) =>
                    set_local_part(
                      apply_input_transform(e.target, (v) =>
                        v.toLowerCase().trim(),
                      ),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e["key"] !== "Enter" || is_composing(e)) return;
                    e.preventDefault();
                    if (can_continue_from_pick) set_step("review");
                  }}
                />
                <Select value={domain} onValueChange={set_domain}>
                  <SelectTrigger className="h-10 w-auto shrink-0 rounded-lg border border-edge-secondary bg-transparent text-sm px-3 focus:ring-0 focus:ring-offset-0">
                    <span className="text-txt-muted me-0.5">@</span>
                    <span className="truncate">{domain}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIMARY_DOMAINS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 min-h-[16px] text-xs">
                {local_part && !validation.valid && (
                  <span className="inline-flex items-center gap-1 text-red-500">
                    <XCircleIcon className="w-3.5 h-3.5 shrink-0" />
                    {validation.error_key
                      ? t(validation.error_key)
                      : t("settings.invalid_address")}
                  </span>
                )}
                {local_part && validation.valid && is_same_as_current && (
                  <span className="inline-flex items-center gap-1 text-txt-muted">
                    <XCircleIcon className="w-3.5 h-3.5 shrink-0" />
                    {t("settings.address_change_same_as_current")}
                  </span>
                )}
                {local_part &&
                  validation.valid &&
                  !is_same_as_current &&
                  checking && (
                    <span className="inline-flex items-center gap-1 text-txt-muted">
                      <ArrowPathIcon className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      {t("settings.address_change_checking")}
                    </span>
                  )}
                {local_part &&
                  validation.valid &&
                  !is_same_as_current &&
                  !checking &&
                  is_available === true && (
                    <span className="inline-flex items-center gap-1 text-green-500">
                      <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                      {t("settings.address_change_available", {
                        email: new_address,
                      })}
                    </span>
                  )}
                {local_part &&
                  validation.valid &&
                  !is_same_as_current &&
                  !checking &&
                  is_available === false && (
                    <span className="inline-flex items-center gap-1 text-red-500">
                      <XCircleIcon className="w-3.5 h-3.5 shrink-0" />
                      {t("settings.address_change_unavailable", {
                        email: new_address,
                      })}
                    </span>
                  )}
                {local_part &&
                  validation.valid &&
                  !is_same_as_current &&
                  !checking &&
                  is_available === null &&
                  check_failed && (
                    <span className="inline-flex items-center gap-1 text-txt-muted">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                      {t("settings.address_change_check_failed")}
                    </span>
                  )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => set_step("intro")}>
              {t("common.back")}
            </Button>
            <Button
              disabled={!can_continue_from_pick}
              variant="depth"
              onClick={() => set_step("review")}
            >
              {t("common.continue")}
            </Button>
          </ModalFooter>
        </>
      )}

      {step === "review" && (
        <>
          <ModalBody className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 rounded-lg border border-edge-secondary px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("settings.address_change_from")}
                </p>
                <p className="text-sm mt-0.5 break-all text-txt-secondary">
                  {current_address}
                </p>
              </div>
              <ArrowRightIcon className="w-4 h-4 shrink-0 text-txt-muted" />
              <div className="min-w-0 flex-1 rounded-lg border border-accent-primary px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("settings.address_change_to")}
                </p>
                <p className="text-sm mt-0.5 break-all text-txt-primary">
                  {new_address}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <IntroPoint
                body={t("settings.address_change_keep_old_body")}
                icon={<InboxArrowDownIcon className="w-5 h-5" />}
                title={t("settings.address_change_keep_old_title", {
                  email: current_address,
                })}
              />
              <IntroPoint
                body={null}
                icon={<ArrowRightIcon className="w-5 h-5" />}
                title={t("settings.address_change_effect_sending", {
                  email: new_address,
                })}
              />
              <IntroPoint
                body={null}
                icon={<KeyIcon className="w-5 h-5" />}
                title={t("settings.address_change_effect_key", {
                  email: new_address,
                })}
              />
              <IntroPoint
                body={null}
                icon={<LockClosedIcon className="w-5 h-5" />}
                title={t("settings.address_change_effect_signed_in")}
              />
              {new_address_is_existing_alias && (
                <IntroPoint
                  body={t("settings.address_change_effect_alias_body")}
                  icon={<AtSymbolIcon className="w-5 h-5" />}
                  title={t("settings.address_change_effect_alias_title", {
                    email: new_address,
                  })}
                />
              )}
              <IntroPoint
                body={next_change_line}
                icon={<ClockIcon className="w-5 h-5" />}
                title={t("settings.address_change_once_title")}
              />
              <IntroPoint
                body={t("settings.address_change_effect_final")}
                icon={<ExclamationTriangleIcon className="w-5 h-5" />}
                title={t("settings.address_change_permanent_title")}
              />
            </div>

            <div>
              <label
                className="block mb-2 text-sm font-medium text-txt-primary"
                htmlFor="primary-address-confirm"
              >
                {t("settings.address_change_type_to_confirm", {
                  email: new_address,
                })}
              </label>
              <Input
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                id="primary-address-confirm"
                spellCheck={false}
                value={confirm_text}
                onChange={(e) => set_confirm_text(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => set_step("pick")}>
              {t("common.back")}
            </Button>
            <Button
              disabled={!can_continue_from_review}
              variant="depth"
              onClick={() => set_step("password")}
            >
              {t("common.continue")}
            </Button>
          </ModalFooter>
        </>
      )}

      {step === "password" && (
        <>
          <ModalBody>
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.address_change_password_title")}
            </p>
            <p className="text-sm mt-0.5 mb-3 text-txt-secondary">
              {t("settings.address_change_password_body")}
            </p>
            <label
              className="block mb-1.5 text-xs font-medium text-txt-secondary"
              htmlFor="primary-address-password"
            >
              {t("auth.password")}
            </label>
            <div className="relative">
              <Input
                autoFocus
                className="pe-10"
                disabled={busy}
                id="primary-address-password"
                maxLength={128}
                placeholder={t("auth.password")}
                type={show_password ? "text" : "password"}
                value={password}
                onChange={(e) => set_password(clamp_password(e.target.value))}
                onKeyDown={(e) => {
                  if (e["key"] !== "Enter" || is_composing(e)) return;
                  e.preventDefault();
                  if (!busy && password) void handle_start();
                }}
              />
              <Button
                aria-label={
                  show_password
                    ? t("settings.hide_password_toggle")
                    : t("settings.show_password_toggle")
                }
                className="absolute end-1 top-1/2 -translate-y-1/2 h-7 w-7"
                disabled={busy}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => set_show_password(!show_password)}
              >
                {show_password ? (
                  <EyeSlashIcon className="w-4 h-4 text-txt-muted" />
                ) : (
                  <EyeIcon className="w-4 h-4 text-txt-muted" />
                )}
              </Button>
            </div>
            {status && <p className="mt-3 text-xs text-txt-muted">{status}</p>}
            {error_line}
          </ModalBody>
          <ModalFooter>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                set_password("");
                set_step("review");
              }}
            >
              {t("common.back")}
            </Button>
            <Button
              disabled={!password || !user?.email || busy}
              is_loading={busy}
              variant="depth"
              onClick={handle_start}
            >
              {t("common.continue")}
            </Button>
          </ModalFooter>
        </>
      )}

      {step === "code" && (
        <>
          <ModalBody>
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.address_change_code_title")}
            </p>
            <p className="text-sm mt-0.5 mb-3 text-txt-secondary">
              {t("settings.address_change_code_body", {
                email: current_address,
              })}
            </p>
            <OtpInput
              aria_label={t("settings.address_change_code_label")}
              disabled={busy}
              length={CODE_LENGTH}
              status={error ? "error" : "default"}
              value={code}
              onChange={set_code}
              onComplete={() => {
                if (!busy) void handle_confirm();
              }}
            />
            <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-txt-muted">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {t("settings.address_change_permanent_body", {
                  email: current_address,
                })}
              </span>
            </p>
            <div className="mt-3">
              <button
                className="text-sm text-accent-primary disabled:text-txt-muted disabled:cursor-default"
                disabled={busy || resend_seconds > 0 || code_locked}
                type="button"
                onClick={handle_resend}
              >
                {resend_seconds > 0
                  ? t("auth.resend_in_seconds", {
                      seconds: String(resend_seconds),
                    })
                  : t("common.resend")}
              </button>
            </div>
            {status && <p className="mt-3 text-xs text-txt-muted">{status}</p>}
            {error_line}
          </ModalBody>
          <ModalFooter>
            <Button disabled={busy} variant="outline" onClick={on_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={code.length !== CODE_LENGTH || busy || code_locked}
              is_loading={busy}
              variant="depth"
              onClick={handle_confirm}
            >
              {t("settings.address_change_title")}
            </Button>
          </ModalFooter>
        </>
      )}

      {step === "done" && (
        <>
          <ModalBody>
            <div className="flex gap-3">
              <CheckCircleIcon className="w-5 h-5 mt-0.5 shrink-0 text-green-500" />
              <p className="text-sm text-txt-secondary">
                {t("settings.address_change_done_body", {
                  email: retained_address || current_address,
                })}
              </p>
            </div>
            {done_change_line && (
              <div className="mt-4 flex gap-3">
                <LockClosedIcon className="w-5 h-5 mt-0.5 shrink-0 text-txt-muted" />
                <p className="text-sm text-txt-secondary">{done_change_line}</p>
              </div>
            )}
            {partial && (
              <div className="mt-4 flex gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" />
                <p className="text-sm text-txt-secondary">
                  {t("settings.address_change_done_partial")}
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="depth" onClick={on_close}>
              {t("common.done")}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
