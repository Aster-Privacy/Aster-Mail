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
import type {
  FamilyGroupResponse,
  FamilyMemberInfo,
  PendingInviteInfo,
} from "@/services/api/family";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";

import { SettingsHeader, SettingsGroup } from "./shared";
import {
  get_family_group,
  invite_member,
  create_invite_link,
  revoke_invite,
  remove_family_member,
  transfer_family_admin,
  leave_family,
} from "@/services/api/family";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";

const GB = 1_073_741_824;
const DEFAULT_STORAGE_GB = 500;

function storage_bar_pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

function role_label(role: "owner" | "member", t: ReturnType<typeof use_i18n>["t"]): string {
  return role === "owner" ? t("settings.family_member_owner") : t("settings.family_member_member");
}

function format_date(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function FamilySection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const [group, set_group] = useState<FamilyGroupResponse | null>(null);
  const [loading, set_loading] = useState(true);

  const [show_invite_form, set_show_invite_form] = useState(false);
  const [invite_email, set_invite_email] = useState("");
  const [invite_storage_gb, set_invite_storage_gb] = useState(
    String(DEFAULT_STORAGE_GB),
  );
  const [invite_loading, set_invite_loading] = useState(false);
  const [invite_captcha, set_invite_captcha] = useState<string | null>(null);
  const turnstile_invite_ref = useRef<TurnstileWidgetRef>(null);

  const [link_loading, set_link_loading] = useState(false);
  const [link_storage_gb, set_link_storage_gb] = useState(
    String(DEFAULT_STORAGE_GB),
  );
  const [link_captcha, set_link_captcha] = useState<string | null>(null);
  const turnstile_link_ref = useRef<TurnstileWidgetRef>(null);

  const [remove_target, set_remove_target] = useState<FamilyMemberInfo | null>(
    null,
  );
  const [transfer_target, set_transfer_target] =
    useState<FamilyMemberInfo | null>(null);
  const [show_leave_dialog, set_show_leave_dialog] = useState(false);
  const [action_loading, set_action_loading] = useState(false);

  const [revoke_target, set_revoke_target] =
    useState<PendingInviteInfo | null>(null);

  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const res = await get_family_group();
      if (res.data) {
        set_group(res.data);
        localStorage.setItem("aster_is_family_plan", "1");
      }
    } catch {
      set_group(null);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handle_invite_email = useCallback(async () => {
    if (!invite_email.trim()) return;
    if (turnstile_required && !invite_captcha) {
      show_toast(t("settings.fam_org_captcha_required"), "error");
      return;
    }
    set_invite_loading(true);
    try {
      const storage_bytes =
        Math.max(1, parseInt(invite_storage_gb, 10) || DEFAULT_STORAGE_GB) *
        GB;
      const res = await invite_member(
        invite_email.trim(),
        storage_bytes,
        invite_captcha ?? undefined,
      );
      if (res.error) {
        show_toast(res.error, "error");
        turnstile_invite_ref.current?.reset();
        set_invite_captcha(null);
        return;
      }
      show_toast(t("settings.family_invite_sent"), "success");
      set_invite_email("");
      set_invite_captcha(null);
      turnstile_invite_ref.current?.reset();
      set_show_invite_form(false);
      await load();
    } finally {
      set_invite_loading(false);
    }
  }, [invite_email, invite_storage_gb, invite_captcha, turnstile_required, t, load]);

  const handle_copy_link = useCallback(async () => {
    if (turnstile_required && !link_captcha) {
      show_toast(t("settings.fam_org_captcha_required"), "error");
      return;
    }
    set_link_loading(true);
    try {
      const storage_bytes =
        Math.max(1, parseInt(link_storage_gb, 10) || DEFAULT_STORAGE_GB) * GB;
      const res = await create_invite_link(
        storage_bytes,
        link_captcha ?? undefined,
      );
      if (res.error || !res.data?.join_url) {
        show_toast(res.error ?? t("errors.unknown_error"), "error");
        turnstile_link_ref.current?.reset();
        set_link_captcha(null);
        return;
      }
      await navigator.clipboard.writeText(res.data.join_url);
      show_toast(t("settings.family_invite_link_copied"), "success");
      set_link_captcha(null);
      turnstile_link_ref.current?.reset();
    } finally {
      set_link_loading(false);
    }
  }, [link_storage_gb, link_captcha, turnstile_required, t]);

  const handle_revoke = useCallback(async () => {
    if (!revoke_target) return;
    set_action_loading(true);
    try {
      await revoke_invite(revoke_target.id);
      set_revoke_target(null);
      await load();
    } finally {
      set_action_loading(false);
    }
  }, [revoke_target, load]);

  const handle_remove = useCallback(async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      await remove_family_member(remove_target.user_id);
      set_remove_target(null);
      await load();
    } finally {
      set_action_loading(false);
    }
  }, [remove_target, load]);

  const handle_transfer = useCallback(async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      await transfer_family_admin(transfer_target.user_id);
      set_transfer_target(null);
      await load();
    } finally {
      set_action_loading(false);
    }
  }, [transfer_target, load]);

  const handle_leave = useCallback(async () => {
    set_action_loading(true);
    try {
      await leave_family();
      set_show_leave_dialog(false);
      localStorage.removeItem("aster_is_family_plan");
      on_back();
    } finally {
      set_action_loading(false);
    }
  }, [on_back]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={on_back}
          on_close={on_close}
          title={t("settings.family_plan_title")}
        />
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={on_back}
          on_close={on_close}
          title={t("settings.family_plan_title")}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[15px] text-[var(--text-primary)]">
            {t("settings.family_plan_subtitle")}
          </p>
        </div>
      </div>
    );
  }

  const is_owner = group.viewer_role === "owner";
  const pool_pct = storage_bar_pct(
    group.storage_used_bytes,
    group.storage_pool_bytes,
  );

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.family_plan_title")}
      />

      <div className="flex-1 overflow-y-auto pb-12">
        <div className="px-4 pt-4 pb-1">
          <div className="rounded-2xl bg-[var(--mobile-bg-card)] px-4 py-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="font-medium text-[var(--text-primary)]">
                {t("settings.family_storage_pool")}
              </span>
              <span className="text-[var(--mobile-text-secondary)]">
                {t("settings.family_storage_allocated")
                  .replace("{{used}}", format_bytes(group.storage_used_bytes))
                  .replace("{{total}}", format_bytes(group.storage_pool_bytes))}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--mobile-bg-card-hover)]">
              <div
                className="h-full rounded-full bg-[var(--mobile-accent,#4f6ef7)] transition-all"
                style={{ width: `${pool_pct}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-[var(--mobile-text-secondary)]">
              {group.plan_name} &middot; {group.members.length}/{group.max_members}{" "}
              {t("settings.family_members").toLowerCase()}
            </p>
          </div>
        </div>

        <SettingsGroup title={t("settings.family_members")}>
          {group.members.map((member, i) => {
            const member_pct = storage_bar_pct(
              member.storage_used_bytes,
              member.allocated_storage_bytes,
            );
            const is_self = member.username === user?.username;
            return (
              <div
                key={member.user_id}
                className={`px-4 py-3 ${i > 0 ? "border-t border-[var(--mobile-border,rgba(255,255,255,0.06))]" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <ProfileAvatar
                    email={`${member.username}@${member.email_domain}`}
                    name={member.username}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                        {member.username}
                        {is_self && (
                          <span className="ml-1 text-[var(--mobile-text-secondary)]">
                            ({t("settings.encryption_banner_you")})
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--mobile-bg-card-hover)] px-2 py-0.5 text-[11px] text-[var(--mobile-text-secondary)]">
                        {role_label(member.role, t)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-[var(--mobile-text-secondary)]">
                      {t("settings.family_member_storage")
                        .replace("{{used}}", format_bytes(member.storage_used_bytes))
                        .replace("{{limit}}", format_bytes(member.allocated_storage_bytes))}
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--mobile-bg-card-hover)]">
                      <div
                        className="h-full rounded-full bg-[var(--mobile-accent,#4f6ef7)] transition-all"
                        style={{ width: `${member_pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {is_owner && !is_self && member.role !== "owner" && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      className="flex-1 rounded-xl bg-[var(--mobile-bg-card-hover)] py-2 text-[13px] font-medium text-[var(--text-primary)] active:opacity-70"
                      type="button"
                      onClick={() => set_transfer_target(member)}
                    >
                      {t("settings.family_transfer_admin")}
                    </button>
                    <button
                      className="flex-1 rounded-xl bg-[var(--mobile-bg-card-hover)] py-2 text-[13px] font-medium text-red-500 active:opacity-70"
                      type="button"
                      onClick={() => set_remove_target(member)}
                    >
                      {t("settings.family_remove_member")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </SettingsGroup>

        {group.pending_invites.length > 0 && (
          <SettingsGroup title={t("settings.family_invite_pending")}>
            {group.pending_invites.map((invite, i) => (
              <div
                key={invite.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-[var(--mobile-border,rgba(255,255,255,0.06))]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-[var(--text-primary)]">
                    {invite.link_only
                      ? t("settings.family_invite_link")
                      : t("settings.family_invite_pending")}
                  </p>
                  <p className="text-[12px] text-[var(--mobile-text-secondary)]">
                    {format_bytes(invite.allocated_storage_bytes)} &middot;{" "}
                    {t("settings.family_invite_expires").replace(
                      "{{date}}",
                      format_date(invite.expires_at),
                    )}
                  </p>
                </div>
                {is_owner && (
                  <button
                    className="shrink-0 rounded-lg bg-[var(--mobile-bg-card-hover)] p-2 active:opacity-70"
                    type="button"
                    onClick={() => set_revoke_target(invite)}
                  >
                    <TrashIcon className="h-4 w-4 text-red-500" />
                  </button>
                )}
              </div>
            ))}
          </SettingsGroup>
        )}

        {is_owner && (
          <SettingsGroup title={t("settings.family_invite_member")}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3.5 active:opacity-80"
              type="button"
              onClick={() => set_show_invite_form((v) => !v)}
            >
              <UserPlusIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
              <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                {t("settings.family_invite_by_email")}
              </span>
              {show_invite_form ? (
                <ChevronUpIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              )}
            </button>

            {show_invite_form && (
              <div className="border-t border-[var(--mobile-border,rgba(255,255,255,0.06))] px-4 pb-4 pt-3">
                <input
                  className="mb-2 w-full rounded-xl border border-[var(--mobile-border,rgba(255,255,255,0.10))] bg-[var(--mobile-bg-card-hover)] px-3 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                  placeholder={t("settings.family_invite_email_placeholder")}
                  type="email"
                  value={invite_email}
                  onChange={(e) => set_invite_email(e.target.value)}
                />
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13px] text-[var(--mobile-text-secondary)]">
                    {t("settings.family_invite_storage")}
                  </span>
                  <input
                    className="w-24 rounded-xl border border-[var(--mobile-border,rgba(255,255,255,0.10))] bg-[var(--mobile-bg-card-hover)] px-3 py-1.5 text-[14px] text-[var(--text-primary)] outline-none"
                    max="10000"
                    min="1"
                    type="number"
                    value={invite_storage_gb}
                    onChange={(e) => set_invite_storage_gb(e.target.value)}
                  />
                  <span className="text-[13px] text-[var(--mobile-text-secondary)]">
                    GB
                  </span>
                </div>
                {turnstile_required && (
                  <div className="mb-2">
                    <TurnstileWidget
                      ref={turnstile_invite_ref}
                      on_verify={set_invite_captcha}
                    />
                  </div>
                )}
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
                  disabled={
                    invite_loading ||
                    !invite_email.trim() ||
                    (turnstile_required && !invite_captcha)
                  }
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  }}
                  type="button"
                  onClick={handle_invite_email}
                >
                  {invite_loading ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings.family_invite_send")}
                </button>
              </div>
            )}

            <div className="border-t border-[var(--mobile-border,rgba(255,255,255,0.06))]">
              <div className="px-4 pb-3 pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13px] text-[var(--mobile-text-secondary)]">
                    {t("settings.family_invite_storage")}
                  </span>
                  <input
                    className="w-24 rounded-xl border border-[var(--mobile-border,rgba(255,255,255,0.10))] bg-[var(--mobile-bg-card-hover)] px-3 py-1.5 text-[14px] text-[var(--text-primary)] outline-none"
                    max="10000"
                    min="1"
                    type="number"
                    value={link_storage_gb}
                    onChange={(e) => set_link_storage_gb(e.target.value)}
                  />
                  <span className="text-[13px] text-[var(--mobile-text-secondary)]">
                    GB
                  </span>
                </div>
                {turnstile_required && (
                  <div className="mb-2">
                    <TurnstileWidget
                      ref={turnstile_link_ref}
                      on_verify={set_link_captcha}
                    />
                  </div>
                )}
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--mobile-border,rgba(255,255,255,0.10))] bg-[var(--mobile-bg-card-hover)] py-2.5 text-[14px] font-medium text-[var(--text-primary)] active:opacity-70 disabled:opacity-50"
                  disabled={
                    link_loading ||
                    (turnstile_required && !link_captcha)
                  }
                  type="button"
                  onClick={handle_copy_link}
                >
                  {link_loading ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardDocumentIcon className="h-4 w-4" />
                  )}
                  {t("settings.family_invite_copy_link")}
                </button>
              </div>
            </div>
          </SettingsGroup>
        )}

        {!is_owner && (
          <div className="px-4 pt-2">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white active:opacity-90"
              style={{
                background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              type="button"
              onClick={() => set_show_leave_dialog(true)}
            >
              {t("settings.family_leave")}
            </button>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!remove_target}
        onOpenChange={(open) => { if (!open) set_remove_target(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_remove_confirm_title").replace(
                "{{name}}",
                remove_target?.username ?? "",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_remove_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action_loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={action_loading}
              onClick={handle_remove}
            >
              {t("settings.family_remove_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!transfer_target}
        onOpenChange={(open) => { if (!open) set_transfer_target(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_transfer_confirm_title").replace(
                "{{name}}",
                transfer_target?.username ?? "",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_transfer_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action_loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={action_loading}
              onClick={handle_transfer}
            >
              {t("settings.family_transfer_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!revoke_target}
        onOpenChange={(open) => { if (!open) set_revoke_target(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_invite_revoke")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_invite_pending")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action_loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={action_loading}
              onClick={handle_revoke}
            >
              {t("settings.family_invite_revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={show_leave_dialog}
        onOpenChange={set_show_leave_dialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_leave_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_leave_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action_loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={action_loading}
              onClick={handle_leave}
            >
              {t("settings.family_leave_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
