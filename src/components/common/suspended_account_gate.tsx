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
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale } from "@/utils/date_format";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { WorkspaceSwitcher } from "@/components/layout/workspace_switcher";
import { use_primary_identity } from "@/lib/primary_identity";

const ExportModal = lazy(() =>
  import("@/components/settings/export_modal").then((m) => ({
    default: m.ExportModal,
  })),
);

export const ACCOUNT_SUSPENDED_EVENT = "aster:account-suspended";
const TERMS_URL = "https://astermail.org/terms";
const APPEAL_URL = "https://astermail.org/appeal";

interface AccountStatus {
  status: string;
  suspended_at: string | null;
  deletion_eligible_at: string | null;
}

interface SuspensionDetails {
  suspended_at: Date | null;
  deletion_eligible_at: Date | null;
}

const EMPTY_DETAILS: SuspensionDetails = {
  suspended_at: null,
  deletion_eligible_at: null,
};

function parse_date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function format_date(date: Date | null): string {
  if (!date) return "";

  return new Intl.DateTimeFormat(app_locale(), { dateStyle: "medium" }).format(
    date,
  );
}

function split_on_token(text: string, token: string): [string, string] {
  const index = text.indexOf(token);
  if (index === -1) return [text, ""];

  return [text.slice(0, index), text.slice(index + token.length)];
}

export function build_appeal_url(address: string): string {
  return address
    ? `${APPEAL_URL}?address=${encodeURIComponent(address)}`
    : APPEAL_URL;
}

export function SuspendedAccountGate() {
  const { t } = use_i18n();
  const { is_authenticated, logout, user } = use_auth();
  const { preferences } = use_preferences();
  const was_authenticated = useRef(false);
  const is_signing_out = useRef(false);
  const [is_visible, set_is_visible] = useState(false);
  const [details, set_details] = useState<SuspensionDetails>(EMPTY_DETAILS);
  const [is_export_open, set_is_export_open] = useState(false);
  const [is_switcher_open, set_is_switcher_open] = useState(false);
  const [is_busy, set_is_busy] = useState(false);

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const display_email = primary_identity.email || account_email;
  const display_name =
    user?.display_name || user?.username || display_email.split("@")[0];

  const load_status = useCallback(async () => {
    const response = await api_client.get<AccountStatus>(
      "/core/v1/account/status",
      { skip_cache: true },
    );

    if (response.data?.status === "suspended") {
      set_details({
        suspended_at: parse_date(response.data.suspended_at),
        deletion_eligible_at: parse_date(response.data.deletion_eligible_at),
      });
      set_is_visible(true);

      return true;
    }

    return false;
  }, []);

  const handle_suspended_signal = useCallback(() => {
    if (is_signing_out.current) return;
    set_is_visible(true);
    load_status().catch((caught) =>
      ignore_error("components/common/suspended_account_gate:signal", caught),
    );
  }, [load_status]);

  useEffect(() => {
    window.addEventListener(ACCOUNT_SUSPENDED_EVENT, handle_suspended_signal);

    return () => {
      window.removeEventListener(
        ACCOUNT_SUSPENDED_EVENT,
        handle_suspended_signal,
      );
    };
  }, [handle_suspended_signal]);

  useEffect(() => {
    if (!is_authenticated) {
      if (was_authenticated.current) {
        set_is_visible(false);
        set_is_export_open(false);
        set_details(EMPTY_DETAILS);
      }
      was_authenticated.current = false;

      return;
    }

    was_authenticated.current = true;
    is_signing_out.current = false;

    let cancelled = false;

    load_status()
      .then((suspended) => {
        if (cancelled) return;
        if (!suspended) set_is_visible(false);
      })
      .catch((caught) =>
        ignore_error("components/common/suspended_account_gate:check", caught),
      );

    return () => {
      cancelled = true;
    };
  }, [is_authenticated, user?.id, load_status]);

  const handle_sign_out = async () => {
    set_is_busy(true);
    is_signing_out.current = true;

    try {
      await logout();
    } catch (caught) {
      ignore_error(
        "components/common/suspended_account_gate:handle_sign_out",
        caught,
      );
    }

    set_is_visible(false);
    set_is_busy(false);
  };

  if (!is_visible) {
    return null;
  }

  const [alert_before, alert_after] = split_on_token(
    t("common.suspended_alert"),
    "{terms}",
  );

  const status_line =
    details.suspended_at && details.deletion_eligible_at
      ? t("common.suspended_since_with_deletion", {
          date: format_date(details.suspended_at),
          deletion_date: format_date(details.deletion_eligible_at),
        })
      : details.suspended_at
        ? t("common.suspended_since", {
            date: format_date(details.suspended_at),
          })
        : t("common.suspended_title");

  return (
    <div
      aria-labelledby="suspended_account_title"
      aria-modal="true"
      className="fixed inset-0 z-[55] flex flex-col overflow-y-auto"
      data-testid="suspended_account_gate"
      role="dialog"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-6">
        <span className="text-[15px] font-semibold tracking-tight">Aster</span>
        <WorkspaceSwitcher
          align="end"
          is_open={is_switcher_open}
          on_open_change={set_is_switcher_open}
          trigger={
            <button
              aria-label={t("auth.your_accounts")}
              className="flex max-w-[280px] items-center gap-2 rounded-full py-1 ps-1 pe-3 text-start transition-colors hover:bg-[var(--bg-secondary)]"
              type="button"
            >
              <ProfileAvatar
                className="block"
                email={account_email}
                image_url={user?.profile_picture}
                name={display_name}
                profile_color={preferences.profile_color}
                size="sm"
              />
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-[13px] font-medium leading-tight">
                  {display_name}
                </span>
                <span
                  className="block truncate text-[12px] leading-tight"
                  style={{ color: "var(--text-muted)" }}
                >
                  {display_email}
                </span>
              </span>
              <svg
                aria-hidden="true"
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "var(--text-muted)" }}
                viewBox="0 0 24 24"
              >
                <path
                  d="m6 9 6 6 6-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          }
        />
      </header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-5 pb-10 pt-4 sm:px-6 sm:pt-8">
        <h1 className="sr-only" id="suspended_account_title">
          {t("common.suspended_title")}
        </h1>

        <div
          className="flex items-start gap-3 rounded-[20px] px-4 py-3.5"
          role="alert"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--color-warning, #f59e0b) 16%, var(--bg-primary))",
          }}
        >
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 flex-shrink-0"
            fill="currentColor"
            style={{ color: "var(--color-warning, #f59e0b)" }}
            viewBox="0 0 20 20"
          >
            <path
              clipRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              fillRule="evenodd"
            />
          </svg>
          <p className="text-[15px] leading-snug">
            {alert_before}
            <a
              className="font-medium underline underline-offset-2"
              href={TERMS_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("common.suspended_alert_terms")}
            </a>
            {alert_after}
          </p>
        </div>

        <p className="mt-7 text-[17px] font-semibold leading-snug">
          {status_line}
        </p>

        <p
          className="mt-4 text-[15px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("common.suspended_appeal_hint")}
        </p>
        <p
          className="mt-4 text-[15px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("common.suspended_download_hint")}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
          <button
            className="aster_btn aster_btn_ghost aster_btn_lg -ms-3"
            disabled={is_busy}
            type="button"
            onClick={() => set_is_export_open(true)}
          >
            {t("common.suspended_download")}
          </button>
          <a
            className="aster_btn aster_btn_depth aster_btn_lg"
            href={build_appeal_url(display_email)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("common.suspended_start_appeal")}
          </a>
        </div>

        <button
          className="mt-8 self-start text-[14px] font-medium hover:underline disabled:opacity-50"
          disabled={is_busy}
          style={{ color: "var(--text-muted)" }}
          type="button"
          onClick={handle_sign_out}
        >
          {t("common.pending_deletion_sign_out")}
        </button>
      </main>

      {is_export_open && (
        <Suspense fallback={null}>
          <ExportModal
            is_open={is_export_open}
            on_close={() => set_is_export_open(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
