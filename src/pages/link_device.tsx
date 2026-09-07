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
import type { ReactNode } from "react";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  verify_device_code,
  confirm_device_code,
} from "@/services/api/devices";
import {
  seal_vault_key_for_device,
  base64url_encode,
  base64url_decode,
} from "@/lib/crypto/device_envelope";
import { get_passphrase_from_memory } from "@/services/crypto/memory_key_store";
import { app_pathname } from "@/lib/account_index_url";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { PlanUpgradeSelection } from "@/components/settings/billing/plan_upgrade_selection";
import { is_composing } from "@/utils/ime";
import { classify_link_error } from "@/pages/link_device_error";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { PlanBadge } from "@/components/common/plan_badge";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_preferences } from "@/contexts/preferences_context";
import { use_primary_identity } from "@/lib/primary_identity";
import { is_official_address } from "@/lib/utils";
import { set_post_switch_path } from "@/lib/post_switch_path";
import { api_client } from "@/services/api/client";
import { has_stored_session_passphrase } from "@/contexts/auth/session_passphrase";
import { UNLIMITED_ACCOUNTS } from "@/services/plan_limits";

type PageState =
  | "choose_account"
  | "input"
  | "confirming_device"
  | "sealing"
  | "upgrade_required"
  | "success"
  | "error";

interface DeviceInfo {
  machine_name: string;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
}

function LinkDeviceShell({
  children,
  heading,
  description,
}: {
  children: ReactNode;
  heading: string;
  description?: string;
}) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="flex flex-col items-center w-full max-w-[352px]">
          <img
            alt="Aster"
            className="h-9"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
          />
          <h1 className="text-[21px] font-semibold mt-6 text-txt-primary text-center tracking-[-0.01em]">
            {heading}
          </h1>
          {description && (
            <p className="text-[13.5px] mt-2 leading-relaxed text-txt-tertiary text-center">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="account_menu_surface w-full mt-6 rounded-[24px] p-2">
      {children}
    </div>
  );
}

function use_time_greeting() {
  const { t } = use_i18n();
  const [greeting, set_greeting] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();

    if (hour < 5) set_greeting(t("auth.greeting_night"));
    else if (hour < 12) set_greeting(t("auth.greeting_morning"));
    else if (hour < 18) set_greeting(t("auth.greeting_afternoon"));
    else set_greeting(t("auth.greeting_evening"));
  }, [t]);

  return greeting;
}

function use_account_identity() {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { limits } = use_plan_limits();

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const display_email = primary_identity.email || account_email;
  const display_name =
    user?.display_name || user?.username || display_email.split("@")[0];

  return {
    account_email,
    display_email,
    display_name,
    profile_picture: user?.profile_picture,
    profile_color: preferences.profile_color,
    plan_code: limits?.plan_code,
    is_paid_plan: !!limits && limits.plan_code !== "free",
  };
}

function CurrentAccountCard({
  action_label,
  on_action,
  is_busy,
}: {
  action_label: string;
  on_action: () => void;
  is_busy: boolean;
}) {
  const { t } = use_i18n();
  const identity = use_account_identity();
  const greeting = use_time_greeting();

  return (
    <div className="account_menu_card rounded-[18px] px-4 py-4">
      <div className="flex items-center gap-3.5">
        <span
          className={`inline-flex leading-none flex-shrink-0 ${identity.is_paid_plan ? "plan_ring" : ""}`}
        >
          <ProfileAvatar
            email={identity.account_email}
            image_url={identity.profile_picture}
            name={identity.display_name}
            profile_color={identity.profile_color}
            size="lg"
          />
        </span>
        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <span
            className="text-[12px] leading-tight"
            style={{ color: "var(--text-muted)" }}
          >
            {greeting && `${greeting}${t("auth.greeting_comma")}`}
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            {is_official_address(identity.display_email) && (
              <img
                alt={t("mail.official_sender")}
                className="block h-4 w-4 flex-shrink-0"
                draggable={false}
                src="/official_badge.webp"
                title={t("mail.official_sender")}
              />
            )}
            <span
              className="min-w-0 flex-1 text-[15px] font-semibold leading-tight truncate"
              style={{ color: "var(--text-primary)" }}
              title={identity.display_name}
            >
              {identity.display_name}
            </span>
            <PlanBadge plan_code={identity.plan_code} />
          </span>
          <span
            className="text-[12px] leading-tight truncate"
            style={{ color: "var(--text-muted)" }}
            title={identity.display_email}
          >
            {identity.display_email}
          </span>
        </div>
      </div>

      <button
        className="account_menu_manage mt-3.5 w-full h-9 rounded-full text-[13px] font-medium transition-colors"
        disabled={is_busy}
        type="button"
        onClick={on_action}
      >
        {action_label}
      </button>
    </div>
  );
}

function AccountPill({ on_click }: { on_click: () => void }) {
  const { t } = use_i18n();
  const identity = use_account_identity();

  if (!identity.display_email) return null;

  return (
    <button
      aria-label={t("auth.link_device_change_account")}
      className="account_menu_row mt-5 flex max-w-full items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-3"
      title={t("auth.link_device_change_account")}
      type="button"
      onClick={on_click}
    >
      <ProfileAvatar
        email={identity.account_email}
        image_url={identity.profile_picture}
        name={identity.display_name}
        profile_color={identity.profile_color}
        size="xs"
      />
      <span
        className="min-w-0 truncate text-[13px] leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {identity.display_email}
      </span>
      <svg
        aria-hidden="true"
        className="h-4 w-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        style={{ color: "var(--text-muted)" }}
        viewBox="0 0 24 24"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function AccountChooser({
  on_select_current,
  on_cancel,
}: {
  on_select_current: () => void;
  on_cancel: () => void;
}) {
  const { t } = use_i18n();
  const {
    accounts,
    current_account_id,
    switch_to_account,
    set_is_adding_account,
    max_account_limit,
  } = use_auth();
  const navigate = useNavigate();
  const [switching_id, set_switching_id] = useState<string | null>(null);

  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );

  const personal_account_count = useMemo(
    () => accounts.filter((a) => a.kind !== "shared").length,
    [accounts],
  );

  const is_unlimited_accounts = max_account_limit === UNLIMITED_ACCOUNTS;
  const at_limit =
    !is_unlimited_accounts &&
    max_account_limit !== null &&
    max_account_limit > 0 &&
    personal_account_count >= max_account_limit;

  const token_backed_sessions = api_client.can_persist_session();
  const return_path = () => `${app_pathname()}${window.location.search}`;

  const handle_switch = async (account_id: string) => {
    if (switching_id) return;

    set_switching_id(account_id);
    set_post_switch_path(return_path());

    try {
      await switch_to_account(account_id);
    } catch {
      set_switching_id(null);
      show_toast(t("settings.switch_failed"), "error");
    }
  };

  const handle_add_account = () => {
    if (at_limit) {
      show_toast(
        t("auth.account_limit_for_plan", { max: String(max_account_limit) }),
        "info",
      );

      return;
    }

    set_is_adding_account(true);
    navigate(`/sign-in?next=${encodeURIComponent(return_path())}`);
  };

  return (
    <LinkDeviceShell
      description={t("auth.link_device_choose_account_description")}
      heading={t("auth.link_device_choose_account")}
    >
      <Panel>
        <CurrentAccountCard
          action_label={t("auth.link_device_use_this_account")}
          is_busy={switching_id !== null}
          on_action={on_select_current}
        />

        <div className="mt-2 flex flex-col gap-2">
          {other_accounts.length > 0 && (
            <p
              className="px-3.5 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--text-muted)" }}
            >
              {t("auth.link_device_other_accounts")}
            </p>
          )}
          {other_accounts.length > 0 && (
            <div
              className={`flex flex-col gap-1.5 ${
                other_accounts.length > 4
                  ? "aster_scrollbar_thin max-h-[min(42vh,300px)] overflow-y-auto pe-0.5"
                  : ""
              }`}
            >
              {other_accounts.map((acc) => {
                const acc_name =
                  acc.user.display_name ||
                  acc.user.username ||
                  acc.user.email.split("@")[0];
                const needs_sign_in = token_backed_sessions
                  ? !acc.refresh_token
                  : !has_stored_session_passphrase(acc.id);

                return (
                  <button
                    key={acc.id}
                    className="account_menu_row group relative w-full h-[60px] flex-shrink-0 px-3.5 flex items-center gap-3.5 rounded-[16px]"
                    disabled={switching_id !== null}
                    type="button"
                    onClick={() => handle_switch(acc.id)}
                  >
                    <span className="inline-flex leading-none flex-shrink-0">
                      <ProfileAvatar
                        email={acc.user.email}
                        image_url={acc.user.profile_picture}
                        name={acc_name}
                        profile_color={acc.user.profile_color}
                        size="sm"
                      />
                    </span>
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5 text-start">
                      <span
                        className="text-[13px] font-medium leading-tight truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {acc_name}
                      </span>
                      <span
                        className="text-[11px] leading-tight truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {acc.user.email}
                      </span>
                    </div>
                    {switching_id === acc.id ? (
                      <Spinner size="sm" />
                    ) : needs_sign_in ? (
                      <span className="account_menu_badge account_menu_badge_muted">
                        {t("auth.session_expired_tag")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <button
            className={`account_menu_tile ${at_limit ? "opacity-60" : ""}`}
            disabled={switching_id !== null}
            type="button"
            onClick={handle_add_account}
          >
            <span className="account_menu_tile_icon">
              <PlusIcon className="w-[18px] h-[18px]" />
            </span>
            <span className="account_menu_tile_label">
              {t("auth.link_device_use_another_account")}
            </span>
            {is_unlimited_accounts ? null : (
              <span className="account_menu_tile_meta tabular-nums">
                {personal_account_count}/{max_account_limit}
              </span>
            )}
          </button>
        </div>
      </Panel>

      <p className="mt-4 px-2 text-center text-[12px] leading-relaxed text-txt-muted">
        {t("auth.link_device_choose_account_note")}
      </p>

      <button
        className="mt-4 rounded-full px-4 py-2 text-[13px] font-medium text-txt-tertiary transition-colors hover:text-txt-primary"
        type="button"
        onClick={on_cancel}
      >
        {t("auth.link_device_cancel")}
      </button>
    </LinkDeviceShell>
  );
}

export default function LinkDevice() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const {
    is_authenticated,
    is_loading: auth_loading,
    has_keys,
    accounts,
  } = use_auth();

  const [page_state, set_page_state] = useState<PageState>("choose_account");
  const [code_input, set_code_input] = useState("");
  const [device_info, set_device_info] = useState<DeviceInfo | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_verifying, set_is_verifying] = useState(false);

  useEffect(() => {
    if (auth_loading) return;
    if (accounts.length > 1) return;
    set_page_state((prev) => (prev === "choose_account" ? "input" : prev));
  }, [auth_loading, accounts.length]);

  useEffect(() => {
    document.title = `${t("auth.link_device_title")} | ${t("common.aster_mail")}`;
  }, [t]);

  useEffect(() => {
    if (auth_loading) return;
    if (!is_authenticated) {
      const next = encodeURIComponent(app_pathname() + window.location.search);

      navigate(`/sign-in?next=${next}`, { replace: true });
    }
  }, [auth_loading, is_authenticated, navigate]);

  const format_code_input = (raw: string): string => {
    const clean = raw
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8);

    if (clean.length > 4) {
      return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }

    return clean;
  };

  const handle_code_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    set_code_input(format_code_input(e.target.value));
    set_error(null);
  };

  const handle_verify = async () => {
    const normalized = code_input.replace(/-/g, "");

    if (normalized.length !== 8) {
      set_error(t("auth.link_device_invalid_code"));

      return;
    }

    set_is_verifying(true);
    set_error(null);

    try {
      const response = await verify_device_code(normalized);

      if (response.error || !response.data) {
        const info = classify_link_error(response);

        set_error(t(info.key));
        show_toast(t(info.key), "error");
        set_is_verifying(false);

        return;
      }

      set_device_info(response.data);
      set_page_state("confirming_device");
    } catch {
      set_error(t("auth.link_device_failed"));
    } finally {
      set_is_verifying(false);
    }
  };

  const handle_confirm = async () => {
    if (!device_info) return;

    set_page_state("sealing");
    set_error(null);

    try {
      const passphrase = get_passphrase_from_memory();

      if (!passphrase) {
        throw new Error("vault_locked");
      }

      const passphrase_bytes = new TextEncoder().encode(passphrase);

      let envelope: Uint8Array;

      try {
        envelope = await seal_vault_key_for_device(
          passphrase_bytes,
          base64url_decode(device_info.ed25519_pk),
          base64url_decode(device_info.mlkem_pk),
          base64url_decode(device_info.x25519_pk),
        );
      } finally {
        passphrase_bytes.fill(0);
      }

      const envelope_b64 = base64url_encode(envelope);
      const normalized = code_input.replace(/-/g, "");

      const response = await confirm_device_code(normalized, envelope_b64);

      if (response.error === "plan_upgrade_required") {
        set_error(null);
        set_page_state("upgrade_required");
        show_toast(t("auth.link_device_upgrade_required_toast"), "info", 15000);

        return;
      }

      if (response.error) {
        const info = classify_link_error(response);

        set_error(t(info.key));
        show_toast(t(info.key), "error");
        if (info.restart) {
          set_device_info(null);
          set_code_input("");
          set_page_state("input");
        } else {
          set_page_state("confirming_device");
        }

        return;
      }

      set_page_state("success");
    } catch (err) {
      const message =
        err instanceof Error && err.message === "vault_locked"
          ? t("common.session_expired_sign_in")
          : t("auth.link_device_failed");

      set_error(message);
      show_toast(message, "error");
      set_page_state("confirming_device");
    }
  };

  const handle_restart = () => {
    set_device_info(null);
    set_code_input("");
    set_error(null);
    set_page_state("input");
  };

  const open_account_chooser = () => {
    set_device_info(null);
    set_code_input("");
    set_error(null);
    set_page_state("choose_account");
  };

  if (auth_loading || !is_authenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surf-primary">
        <Spinner size="md" />
      </div>
    );
  }

  if (!has_keys) {
    return (
      <LinkDeviceShell
        description={t("common.session_expired_sign_in")}
        heading={t("auth.link_device_title")}
      >
        <Button
          className="w-full mt-8"
          size="xl"
          variant="depth"
          onClick={() => navigate("/sign-in")}
        >
          {t("auth.sign_in")}
        </Button>
      </LinkDeviceShell>
    );
  }

  if (page_state === "choose_account") {
    return (
      <AccountChooser
        on_cancel={() => navigate("/")}
        on_select_current={() => set_page_state("input")}
      />
    );
  }

  if (page_state === "upgrade_required") {
    return (
      <PlanUpgradeSelection
        back_label={t("auth.link_device_cancel")}
        heading={t("auth.link_device_upgrade_title")}
        on_back={handle_restart}
        subheading={t("auth.link_device_upgrade_description")}
      />
    );
  }

  if (page_state === "success") {
    return (
      <LinkDeviceShell
        description={t("auth.link_device_success_description")}
        heading={t("auth.link_device_success")}
      >
        <div className="link_device_success_mark mt-7 flex h-14 w-14 items-center justify-center rounded-full">
          <svg
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            viewBox="0 0 24 24"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Button
          className="w-full mt-8"
          size="xl"
          variant="depth"
          onClick={() => navigate("/", { replace: true })}
        >
          {t("common.done")}
        </Button>
      </LinkDeviceShell>
    );
  }

  if (page_state === "sealing") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surf-primary">
        <div className="flex flex-col items-center">
          <Spinner size="md" />
          <p className="text-sm mt-4 text-txt-secondary">
            {t("auth.link_device_confirming")}
          </p>
        </div>
      </div>
    );
  }

  if (page_state === "confirming_device" && device_info) {
    return (
      <LinkDeviceShell
        description={t("auth.link_device_confirm_prompt")}
        heading={t("auth.link_device_title")}
      >
        <AccountPill on_click={open_account_chooser} />

        <Panel>
          <div className="account_menu_card rounded-[18px] px-4 py-4">
            <div className="flex items-center gap-3.5">
              <span className="account_menu_tile_icon">
                <ComputerDesktopIcon className="w-[18px] h-[18px]" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className="text-[13px] font-medium leading-tight truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {device_info.machine_name}
                </span>
                <span
                  className="text-[11px] leading-tight truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("auth.link_device_desktop")}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {error && (
          <p className="text-[13px] mt-4 text-center text-red-500">{error}</p>
        )}

        <Button
          className="w-full mt-6"
          size="xl"
          variant="depth"
          onClick={handle_confirm}
        >
          {t("auth.link_device_confirm_button")}
        </Button>
        <button
          className="mt-4 rounded-full px-4 py-2 text-[13px] font-medium text-txt-tertiary transition-colors hover:text-txt-primary"
          type="button"
          onClick={handle_restart}
        >
          {t("auth.link_device_cancel")}
        </button>
      </LinkDeviceShell>
    );
  }

  return (
    <LinkDeviceShell
      description={t("auth.link_device_enter_code")}
      heading={t("auth.link_device_title")}
    >
      <AccountPill on_click={open_account_chooser} />

      <input
        autoFocus
        aria-label={t("auth.link_device_enter_code")}
        autoComplete="off"
        className="link_device_code_input w-full mt-6 rounded-[18px] px-5 py-4 text-center text-2xl font-mono font-bold tracking-[0.15em] text-txt-primary placeholder:text-txt-muted placeholder:font-normal placeholder:text-xl placeholder:tracking-[0.1em]"
        maxLength={9}
        placeholder={t("auth.link_device_code_placeholder")}
        spellCheck={false}
        type="text"
        value={code_input}
        onChange={handle_code_change}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !is_composing(e)) handle_verify();
        }}
      />

      {error && (
        <p className="text-[13px] mt-3 text-center text-red-500">{error}</p>
      )}

      <Button
        className="w-full mt-5"
        disabled={is_verifying || code_input.replace(/-/g, "").length < 8}
        size="xl"
        variant="depth"
        onClick={handle_verify}
      >
        {is_verifying ? (
          <Spinner size="sm" />
        ) : (
          t("auth.link_device_verify_button")
        )}
      </Button>
      <button
        className="mt-4 rounded-full px-4 py-2 text-[13px] font-medium text-txt-tertiary transition-colors hover:text-txt-primary"
        type="button"
        onClick={() => navigate("/")}
      >
        {t("auth.link_device_cancel")}
      </button>
    </LinkDeviceShell>
  );
}
