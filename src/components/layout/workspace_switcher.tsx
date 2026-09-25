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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WorkspaceSwitcherView } from "@aster/ui";

import { get_zoned_parts } from "@/utils/date_format";
import { copy_text_or_throw } from "@/utils/copy_text";
import { show_toast } from "@/components/toast/simple_toast";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AccountAvatarButton } from "@/components/ui/account_avatar_button";
import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats, prefetch_mail_stats } from "@/hooks/use_mail_stats";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_resubscribe } from "@/hooks/use_resubscribe";
import { PlanBadge } from "@/components/common/plan_badge";
import { use_preferences } from "@/contexts/preferences_context";
import { get_all_accounts } from "@/services/account_manager";
import {
  type hub_account,
  read_hub_accounts,
  sign_out_hub_accounts,
  uses_account_hub,
} from "@/services/account_hub_link";
import { api_client } from "@/services/api/client";
import { has_stored_session_passphrase } from "@/contexts/auth/session_passphrase";
import { UNLIMITED_ACCOUNTS } from "@/services/plan_limits";
import { use_primary_identity } from "@/lib/primary_identity";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes, is_official_address } from "@/lib/utils";
import { ignore_error } from "@/lib/ignore_error";

interface WorkspaceSwitcherProps {
  align?: "start" | "center" | "end";
  trigger: React.ReactNode;
  is_open: boolean;
  on_open_change: (open: boolean) => void;
}

export function WorkspaceSwitcher({
  align = "start",
  trigger,
  is_open,
  on_open_change,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const { t } = use_i18n();
  const {
    user,
    logout,
    accounts,
    current_account_id,
    remove_account,
    switch_to_account,
    set_is_adding_account,
    max_account_limit,
  } = use_auth();
  const { preferences } = use_preferences();
  const { stats, has_initialized: stats_ready, refresh } = use_mail_stats();
  const { limits } = use_plan_limits();
  const { can_resubscribe, resubscribe } = use_resubscribe(is_open);
  const is_paid_plan = !!limits && limits.plan_code !== "free";

  const is_unlimited_accounts = max_account_limit === UNLIMITED_ACCOUNTS;
  const max_allowed =
    max_account_limit !== null && max_account_limit > 0
      ? max_account_limit
      : null;

  const personal_account_count = useMemo(
    () => accounts.filter((a) => a.kind !== "shared").length,
    [accounts],
  );
  const at_limit =
    max_allowed !== null && personal_account_count >= max_allowed;
  const display_max =
    max_allowed === null
      ? personal_account_count
      : Math.max(max_allowed, personal_account_count);

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const current_user_email = primary_identity.email || account_email;
  const current_display_name =
    user?.display_name || user?.username || current_user_email.split("@")[0];

  const token_backed_sessions = api_client.can_persist_session();
  const [plan_flags, set_plan_flags] = useState<Record<string, boolean>>({});

  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );
  const [hub_only_accounts, set_hub_only_accounts] = useState<hub_account[]>(
    [],
  );

  useEffect(() => {
    if (!is_open || !uses_account_hub()) return;

    let cancelled = false;

    read_hub_accounts().then((list) => {
      if (cancelled || !list) return;

      const local_ids = new Set(accounts.map((a) => a.id));

      set_hub_only_accounts(list.filter((a) => !local_ids.has(a.id)));
    });

    return () => {
      cancelled = true;
    };
  }, [is_open, accounts]);

  const default_account_id = useMemo(() => {
    const personal = accounts.filter((a) => a.kind !== "shared");

    if (personal.length === 0) return null;

    return personal.reduce((oldest, a) =>
      a.added_at < oldest.added_at ? a : oldest,
    ).id;
  }, [accounts]);

  useEffect(() => {
    if (!is_open) return;

    let cancelled = false;

    get_all_accounts()
      .then((stored) => {
        if (cancelled) return;
        const flags: Record<string, boolean> = {};

        for (const acc of stored)
          flags[acc.id] = acc.user.is_paid_plan === true;
        set_plan_flags(flags);
      })
      .catch((caught) =>
        ignore_error(
          "components/layout/workspace_switcher:WorkspaceSwitcher",
          caught,
        ),
      );

    return () => {
      cancelled = true;
    };
  }, [is_open, current_account_id, limits]);

  const [time_greeting, set_time_greeting] = useState("");

  useEffect(() => {
    if (!is_open) return;
    const hour = get_zoned_parts(new Date()).hours;

    if (hour < 5) set_time_greeting(t("auth.greeting_night"));
    else if (hour < 12) set_time_greeting(t("auth.greeting_morning"));
    else if (hour < 18) set_time_greeting(t("auth.greeting_afternoon"));
    else set_time_greeting(t("auth.greeting_evening"));
  }, [is_open, t]);

  const storage_percent = useMemo(() => {
    if (!stats.storage_total_bytes) return 0;

    return Math.min(
      100,
      Math.round((stats.storage_used_bytes / stats.storage_total_bytes) * 100),
    );
  }, [stats.storage_total_bytes, stats.storage_used_bytes]);

  useEffect(() => {
    if (!is_open) return;
    if (!stats_ready) {
      refresh();

      return;
    }
    prefetch_mail_stats();
  }, [is_open, stats_ready, refresh]);

  const storage_used_label = useMemo(() => {
    if (!stats_ready || !stats.storage_total_bytes) return null;

    return t("auth.storage_of_used", {
      used: format_bytes(stats.storage_used_bytes),
      total: format_bytes(stats.storage_total_bytes),
    });
  }, [stats_ready, stats.storage_total_bytes, stats.storage_used_bytes, t]);

  const open_account_settings = useCallback(() => {
    on_open_change(false);
    navigate("/settings/account");
  }, [navigate, on_open_change]);

  const begin_add_account = useCallback(
    (sign_in_path: string) => {
      if (at_limit) {
        show_toast(
          t("auth.account_limit_for_plan", { max: String(max_allowed) }),
          "info",
        );
        on_open_change(false);
        navigate("/settings/billing");

        return;
      }
      on_open_change(false);
      set_is_adding_account(true);
      navigate(sign_in_path);
    },
    [at_limit, max_allowed, on_open_change, set_is_adding_account, navigate, t],
  );

  const handle_add_account = useCallback(
    () => begin_add_account("/sign-in"),
    [begin_add_account],
  );

  const handle_hub_account = useCallback(
    (account_id: string) =>
      begin_add_account(
        `/sign-in?hub_account=${encodeURIComponent(account_id)}`,
      ),
    [begin_add_account],
  );

  const handle_switch = useCallback(
    async (account_id: string) => {
      on_open_change(false);
      try {
        await switch_to_account(account_id);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        show_toast(t("settings.switch_failed"), "error");
      }
    },
    [on_open_change, switch_to_account, t],
  );

  const handle_logout = useCallback(async () => {
    on_open_change(false);
    try {
      await logout();
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      navigate("/sign-in");
    }
  }, [on_open_change, logout, navigate]);

  const handle_logout_all = useCallback(async () => {
    if (uses_account_hub()) {
      await sign_out_hub_accounts("all");
    }
    for (const acc of other_accounts) {
      try {
        await remove_account(acc.id);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }
    await handle_logout();
  }, [other_accounts, remove_account, handle_logout]);

  const copy_account_email = useCallback(async () => {
    if (!current_user_email) return;
    try {
      await copy_text_or_throw(current_user_email);
      show_toast(t("common.address_copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  }, [current_user_email, t]);

  const labels = useMemo(
    () => ({
      official_sender: t("mail.official_sender"),
      manage_account: t("auth.manage_account"),
      storage_used: t("common.storage_used"),
      resubscribe: t("auth.resubscribe_to_aster"),
      add_account: t("auth.add_another_account"),
      sign_out: t("auth.sign_out"),
      sign_out_all: t("auth.sign_out_all"),
    }),
    [t],
  );

  const account_rows = other_accounts.map((acc) => {
    const acc_name =
      acc.user.display_name || acc.user.username || acc.user.email.split("@")[0];
    const needs_sign_in = token_backed_sessions
      ? !acc.refresh_token
      : !has_stored_session_passphrase(acc.id);

    return {
      id: acc.id,
      name: acc_name,
      email: acc.user.email,
      href: `/?account=${encodeURIComponent(acc.id)}`,
      has_plan_ring: plan_flags[acc.id] === true,
      avatar: (
        <ProfileAvatar
          email={acc.user.email}
          image_url={acc.user.profile_picture}
          name={acc_name}
          profile_color={acc.user.profile_color}
          size="sm"
        />
      ),
      badge: needs_sign_in
        ? { label: t("auth.session_expired_tag"), muted: true }
        : acc.id === default_account_id
          ? { label: t("auth.default_account") }
          : null,
    };
  });

  const hub_rows = hub_only_accounts.map((acc) => {
    const acc_name = acc.display_name || acc.email.split("@")[0];

    return {
      id: acc.id,
      name: acc_name,
      email: acc.email,
      avatar: (
        <ProfileAvatar
          email={acc.email}
          image_url={acc.profile_picture ?? undefined}
          name={acc_name}
          profile_color={acc.profile_color ?? undefined}
          size="sm"
        />
      ),
      badge: acc.linkable
        ? null
        : { label: t("auth.hub_account_password_required"), muted: true },
    };
  });

  return (
    <WorkspaceSwitcherView
      accounts={account_rows}
      add_account_dimmed={at_limit}
      add_account_meta={
        is_unlimited_accounts ? null : `${personal_account_count}/${display_max}`
      }
      align={align}
      display_name={current_display_name}
      email={current_user_email}
      greeting={
        time_greeting ? `${time_greeting}${t("auth.greeting_comma")}` : ""
      }
      header_avatar={
        <AccountAvatarButton
          email={account_email}
          image_url={user?.profile_picture}
          is_paid_plan={is_paid_plan}
          name={current_display_name}
          profile_color={preferences.profile_color}
          ring_offset_color="color-mix(in srgb, var(--text-primary) 9%, var(--dropdown-bg))"
          size="lg"
        />
      }
      hub_accounts={hub_rows}
      is_official={is_official_address(current_user_email)}
      is_open={is_open}
      labels={labels}
      plan_badge={<PlanBadge plan_code={limits?.plan_code} />}
      show_resubscribe={can_resubscribe}
      show_sign_out_all={other_accounts.length > 0}
      storage_percent={storage_percent}
      storage_used_text={storage_used_label}
      trigger={trigger}
      on_add_account={handle_add_account}
      on_copy_email={copy_account_email}
      on_hub_account={handle_hub_account}
      on_manage_account={open_account_settings}
      on_open_change={on_open_change}
      on_resubscribe={() => {
        on_open_change(false);
        resubscribe();
      }}
      on_sign_out={handle_logout}
      on_sign_out_all={handle_logout_all}
      on_switch_account={handle_switch}
    />
  );
}
