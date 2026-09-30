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
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale } from "@/utils/date_format";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { WorkspaceSwitcher } from "@/components/layout/workspace_switcher";
import { use_primary_identity } from "@/lib/primary_identity";
import { WarningIcon } from "@/components/auth/auth_styles";

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

const RowChevron = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ color: "var(--text-muted)" }}
    viewBox="0 0 24 24"
  >
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
        : "";

  return (
    <div
      aria-labelledby="suspended_account_title"
      aria-modal="true"
      className="fixed inset-0 z-[55] overflow-y-auto bg-surf-primary text-txt-primary"
      data-testid="suspended_account_gate"
      role="dialog"
    >
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4 pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="flex w-full max-w-[440px] flex-col items-start px-4 text-start">
          <img
            alt="Aster"
            className="h-7"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
          />

          <WorkspaceSwitcher
            align="start"
            is_open={is_switcher_open}
            on_open_change={set_is_switcher_open}
            trigger={
              <button
                aria-label={t("auth.your_accounts")}
                className="account_menu_card mt-6 flex w-full items-center gap-3.5 rounded-[18px] px-4 py-3.5 text-start transition-[filter] hover:brightness-[1.06]"
                data-testid="suspended_account_switcher"
                type="button"
              >
                <ProfileAvatar
                  className="block"
                  email={account_email}
                  image_url={user?.profile_picture}
                  name={display_name}
                  profile_color={preferences.profile_color}
                  size="lg"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold leading-tight">
                    {display_name}
                  </span>
                  <span
                    className="truncate text-[12px] leading-tight"
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

          <h1
            className="mt-6 text-base font-semibold text-txt-primary"
            id="suspended_account_title"
          >
            {t("common.suspended_title")}
          </h1>
          {status_line && (
            <p className="mt-1.5 text-sm leading-relaxed text-txt-tertiary">
              {status_line}
            </p>
          )}

          <div
            className="mt-4 flex w-full items-start gap-2.5 rounded-lg px-4 py-3 text-sm leading-relaxed"
            role="alert"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent)",
            }}
          >
            <WarningIcon color="var(--color-warning, #f59e0b)" />
            <p>
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

          <div className="mt-6 flex w-full flex-col gap-2">
            <a
              className="account_menu_row flex w-full items-center gap-3.5 rounded-[16px] px-3.5 py-3.5 no-underline"
              data-testid="suspended_start_appeal"
              href={build_appeal_url(display_email)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium leading-tight text-txt-primary">
                  {t("common.suspended_start_appeal")}
                </span>
                <span
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("common.suspended_appeal_hint")}
                </span>
              </span>
              <RowChevron />
            </a>
            <button
              className="account_menu_row flex w-full items-center gap-3.5 rounded-[16px] px-3.5 py-3.5 text-start disabled:opacity-50"
              data-testid="suspended_download"
              disabled={is_busy}
              type="button"
              onClick={() => set_is_export_open(true)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium leading-tight text-txt-primary">
                  {t("common.suspended_download")}
                </span>
                <span
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("common.suspended_download_hint")}
                </span>
              </span>
              <RowChevron />
            </button>
          </div>

          <button
            className="account_menu_manage mt-6 h-9 w-full rounded-full text-[13px] font-medium transition-colors disabled:opacity-50"
            data-testid="suspended_sign_out"
            disabled={is_busy}
            type="button"
            onClick={handle_sign_out}
          >
            {t("common.pending_deletion_sign_out")}
          </button>
        </div>
      </div>

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
