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
import { useCallback, useMemo } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { has_stored_session_passphrase } from "@/contexts/auth/session_passphrase";
import { UNLIMITED_ACCOUNTS } from "@/services/plan_limits";
import { use_i18n } from "@/lib/i18n/context";

interface MobileAccountListProps {
  on_close: () => void;
  handle_nav: (path: string) => void;
}

export function MobileAccountList({
  on_close,
  handle_nav,
}: MobileAccountListProps) {
  const { t } = use_i18n();
  const {
    accounts,
    current_account_id,
    switch_to_account,
    set_is_adding_account,
    max_account_limit,
  } = use_auth();

  const max_allowed =
    max_account_limit !== null &&
    max_account_limit > 0 &&
    max_account_limit !== UNLIMITED_ACCOUNTS
      ? max_account_limit
      : null;
  const personal_account_count = useMemo(
    () => accounts.filter((a) => a.kind !== "shared").length,
    [accounts],
  );
  const at_limit =
    max_allowed !== null && personal_account_count >= max_allowed;
  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );
  const token_backed_sessions = api_client.can_persist_session();

  const handle_switch = useCallback(
    async (account_id: string) => {
      on_close();
      try {
        await switch_to_account(account_id);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        show_toast(t("settings.switch_failed"), "error");
      }
    },
    [on_close, switch_to_account, t],
  );

  const handle_add = useCallback(() => {
    on_close();
    if (at_limit) {
      show_toast(
        t("auth.account_limit_for_plan", { max: String(max_allowed) }),
        "info",
      );
      handle_nav("/settings/billing");

      return;
    }
    set_is_adding_account(true);
    handle_nav("/sign-in");
  }, [at_limit, max_allowed, on_close, set_is_adding_account, handle_nav, t]);

  return (
    <div className="space-y-1 px-4 pb-2">
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
            className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-start active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => handle_switch(acc.id)}
          >
            <ProfileAvatar
              email={acc.user.email}
              image_url={acc.user.profile_picture}
              name={acc_name}
              profile_color={acc.user.profile_color}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-[var(--text-primary)]">
                {acc_name}
              </span>
              <span className="block truncate text-[12px] text-[var(--text-muted)]">
                {acc.user.email}
              </span>
            </span>
            {needs_sign_in && (
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                {t("auth.session_expired_tag")}
              </span>
            )}
          </button>
        );
      })}
      <button
        className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start active:bg-[var(--bg-tertiary)]${at_limit ? " opacity-60" : ""}`}
        type="button"
        onClick={handle_add}
      >
        <PlusIcon className="h-5 w-5 text-[var(--text-muted)]" />
        <span className="flex-1 text-[15px] text-[var(--text-primary)]">
          {t("auth.add_another_account")}
        </span>
        {max_allowed !== null && (
          <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
            {`${personal_account_count}/${Math.max(max_allowed, personal_account_count)}`}
          </span>
        )}
      </button>
    </div>
  );
}
