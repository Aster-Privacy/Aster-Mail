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
import { useState, useEffect, useCallback } from "react";
import {
  UserPlusIcon,
  UserGroupIcon,
  LinkIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  CircleStackIcon,
  EnvelopeIcon,
  ArrowsRightLeftIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { get_avatar_color } from "@/lib/avatar_color";
import { change_plan } from "@/services/api/billing";
import { FamilyOrgPanel } from "./family_org_panel";

import {
  get_family_group,
  invite_member,
  create_invite_link,
  revoke_invite,
  remove_family_member,
  update_member_storage,
  transfer_family_admin,
  leave_family,
  type FamilyGroupResponse,
  type FamilyMemberInfo,
} from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
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

function storage_bar(used: number, limit: number) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-500";
  return (
    <div className="w-full bg-edge-secondary rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface MemberRowProps {
  member: FamilyMemberInfo;
  is_owner_view: boolean;
  on_remove: (user_id: string) => void;
  on_transfer: (user_id: string) => void;
  on_storage_update: (user_id: string, bytes: number) => void;
}

function MemberRow({
  member,
  is_owner_view,
  on_remove,
  on_transfer,
  on_storage_update,
}: MemberRowProps) {
  const { t } = use_i18n();
  const [editing_storage, set_editing_storage] = useState(false);
  const [storage_input, set_storage_input] = useState(
    String(Math.round(member.allocated_storage_bytes / 1073741824))
  );

  const save_storage = useCallback(() => {
    const gb = parseFloat(storage_input);
    if (isNaN(gb) || gb < 1) return;
    on_storage_update(member.user_id, Math.round(gb * 1073741824));
    set_editing_storage(false);
  }, [storage_input, member.user_id, on_storage_update]);

  const display_name = `${member.username}@${member.email_domain}`;
  const role_label =
    member.role === "owner"
      ? t("settings.family_member_owner")
      : member.status === "grace"
      ? t("settings.family_member_grace")
      : t("settings.family_member_member");

  const avatar_color = get_avatar_color(member.username);
  const badge_class = member.role === "owner"
    ? "aster_badge aster_badge_blue"
    : member.status === "grace"
    ? "aster_badge aster_badge_amber"
    : "aster_badge aster_badge_gray";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-edge-secondary last:border-0">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold select-none"
        style={{ backgroundColor: avatar_color }}
      >
        {member.username[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-txt-primary truncate">
            {display_name}
          </span>
          <span className={badge_class}>
            {role_label}
          </span>
        </div>
        <div className="text-xs text-txt-muted mt-0.5">
          {format_bytes(member.storage_used_bytes)} / {format_bytes(member.allocated_storage_bytes)}
        </div>
        {storage_bar(member.storage_used_bytes, member.allocated_storage_bytes)}
      </div>

      {is_owner_view && member.role !== "owner" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing_storage ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={storage_input}
                onChange={(e) => set_storage_input(e.target.value)}
                className="w-16 text-xs border border-edge-secondary rounded px-1.5 py-0.5 bg-surf-primary text-txt-primary"
              />
              <span className="text-xs text-txt-muted">GB</span>
              <button onClick={save_storage} className="text-green-600 hover:text-green-700">
                <CheckIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => set_editing_storage(false)}
                className="text-txt-muted hover:text-txt-secondary"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => set_editing_storage(true)}
              className="p-1 text-txt-muted hover:text-txt-secondary "
              title={t("settings.family_storage_edit")}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => on_transfer(member.user_id)}
            className="p-1 text-txt-muted hover:text-accent-blue"
            title={t("settings.family_transfer_admin")}
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => on_remove(member.user_id)}
            className="p-1 text-txt-muted hover:text-red-600 dark:hover:text-red-400"
            title={t("settings.family_remove_member")}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

interface FamilySectionProps {
  is_family_plan: boolean;
}

export function FamilySection({ is_family_plan }: FamilySectionProps) {
  const { t } = use_i18n();
  const [group, set_group] = useState<FamilyGroupResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [invite_email, set_invite_email] = useState("");
  const [invite_storage_gb, set_invite_storage_gb] = useState("500");
  const [invite_loading, set_invite_loading] = useState(false);
  const [remove_target, set_remove_target] = useState<FamilyMemberInfo | null>(null);
  const [transfer_target, set_transfer_target] = useState<FamilyMemberInfo | null>(null);
  const [show_leave_dialog, set_show_leave_dialog] = useState(false);
  const [action_loading, set_action_loading] = useState(false);

  const load_group = useCallback(async () => {
    try {
      const res = await get_family_group();
      if (res.data) {
        set_group(res.data);
        const active = res.data.members.filter(m => m.status === "active").length;
        const remaining_seats = Math.max(1, res.data.max_members - active);
        const used_alloc = res.data.members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
        const remaining_bytes = res.data.storage_pool_bytes - used_alloc;
        const default_gb = Math.max(1, Math.round(remaining_bytes / remaining_seats / 1073741824));
        set_invite_storage_gb(String(default_gb));
      }
    } catch {
      // not in a family group yet
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_family_plan) load_group();
    else set_loading(false);
  }, [is_family_plan, load_group]);

  const is_owner = group?.viewer_role === "owner";
  const has_pending_link = group?.pending_invites.some(i => i.link_only) ?? false;

  const handle_invite_email = async () => {
    const email = invite_email.trim();
    if (!email) {
      show_toast("Enter an email address to send an invite", "error");
      return;
    }
    const email_re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email_re.test(email)) {
      show_toast("Enter a valid email address", "error");
      return;
    }
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);
    if (!invite_storage_gb || isNaN(storage) || storage < 1) return;
    set_invite_loading(true);
    try {
      const res = await invite_member(email, storage);
      if (!res.data) throw new Error();
      show_toast(t("settings.family_invite_sent"), "success");
      set_invite_email("");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_invite_loading(false);
    }
  };

  const handle_copy_link = async () => {
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);
    if (!invite_storage_gb || isNaN(storage) || storage < 1) return;
    set_invite_loading(true);
    try {
      const res = await create_invite_link(storage);
      if (!res.data) throw new Error();
      await navigator.clipboard.writeText(res.data.join_url);
      show_toast(t("settings.family_invite_link_copied"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_invite_loading(false);
    }
  };

  const handle_revoke_invite = async (invite_id: string) => {
    try {
      await revoke_invite(invite_id);
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    }
  };

  const handle_remove_confirm = async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      await remove_family_member(remove_target.user_id);
      show_toast(t("settings.family_remove_member"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_remove_target(null);
    }
  };

  const handle_transfer_confirm = async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      await transfer_family_admin(transfer_target.user_id);
      show_toast(t("settings.family_transfer_admin"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_transfer_target(null);
    }
  };

  const handle_leave_confirm = async () => {
    set_action_loading(true);
    try {
      await leave_family();
      show_toast(t("settings.family_leave"), "success");
      set_group(null);
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_show_leave_dialog(false);
    }
  };

  const handle_storage_update = async (user_id: string, bytes: number) => {
    try {
      await update_member_storage(user_id, bytes);
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    }
  };

  const [changing_plan, set_changing_plan] = useState(false);

  const handle_change_to_individual = async (plan_code: string) => {
    set_changing_plan(true);
    try {
      const res = await change_plan(plan_code, "year");
      if (res.ok) {
        show_toast(t("settings.change_plan"), "success");
        window.location.reload();
      } else {
        show_toast(t("settings.failed_save_setting"), "error");
      }
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_changing_plan(false);
    }
  };

  const [family_view, set_family_view] = useState<"overview" | "admin">("overview");

  if (!is_family_plan || loading) return null;
  if (!group) return null;

  const active_members = group.members.filter((m) => m.status !== "removed");
  const pool_used = group.members.reduce((s, m) => s + m.storage_used_bytes, 0);
  const pool_pct = group.storage_pool_bytes > 0 ? Math.min(100, (pool_used / group.storage_pool_bytes) * 100) : 0;
  const seats_remaining = group.max_members - active_members.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{group.plan_name}</h2>
        <p className="text-sm text-txt-secondary mt-0.5">
          {active_members.length} of {group.max_members} members &middot; {seats_remaining} seat{seats_remaining !== 1 ? "s" : ""} available
        </p>
      </div>

      {is_owner && (
        <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
          {(["overview", "admin"] as const).map((v) => (
            <button
              key={v}
              onClick={() => set_family_view(v)}
              className="relative flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none"
              style={{
                backgroundColor: family_view === v ? "var(--bg-primary)" : "transparent",
                color: family_view === v ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: family_view === v ? "rgba(0,0,0,0.1) 0px 1px 3px, rgba(0,0,0,0.06) 0px 1px 2px" : "none",
              }}
            >
              {v === "admin" && <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />}
              {v === "overview" ? "Overview" : "Admin"}
            </button>
          ))}
        </div>
      )}

      {is_owner && family_view === "admin" && (
        <FamilyOrgPanel group={group} members={active_members} />
      )}

      {family_view === "overview" && (<>

      {/* ── Storage stat row ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
            <CircleStackIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
            Storage
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <div className="flex items-center justify-between py-2">
          <div className="flex-1 pr-6">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-txt-primary">{format_bytes(pool_used)}</span>
              <span className="text-xs text-txt-muted">of {format_bytes(group.storage_pool_bytes)} used</span>
            </div>
            <div className="w-full bg-edge-secondary rounded-full h-1.5 mt-2">
              <div className={`h-1.5 rounded-full transition-all ${pool_pct >= 90 ? "bg-red-500" : pool_pct >= 70 ? "bg-amber-500" : "bg-accent-blue"}`} style={{ width: `${pool_pct}%` }} />
            </div>
          </div>
          <div className="flex gap-6 flex-shrink-0 text-right">
            <div>
              <p className="text-xs text-txt-muted">Members</p>
              <p className="text-sm font-semibold text-txt-primary">{active_members.length} / {group.max_members}</p>
            </div>
            <div>
              <p className="text-xs text-txt-muted">Encryption</p>
              <p className="text-sm font-semibold text-txt-primary">Zero-access</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Members ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
            <UserGroupIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
            {t("settings.family_members")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <div className="divide-y divide-edge-secondary">
          {active_members.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              is_owner_view={is_owner}
              on_remove={(uid) => set_remove_target(group.members.find((x) => x.user_id === uid) ?? null)}
              on_transfer={(uid) => set_transfer_target(group.members.find((x) => x.user_id === uid) ?? null)}
              on_storage_update={handle_storage_update}
            />
          ))}
        </div>
      </div>

      {/* ── Invite ── */}
      {is_owner && active_members.length < group.max_members && (
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
              <UserPlusIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
              {t("settings.family_invite_member")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="py-2 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input type="email" placeholder={t("settings.family_invite_email_placeholder")} value={invite_email} onChange={(e) => set_invite_email(e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <Input type="number" min="1" value={invite_storage_gb} onChange={(e) => set_invite_storage_gb(e.target.value)} className="w-20" />
                <span className="text-sm text-txt-muted">GB</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handle_invite_email} disabled={invite_loading} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
                <UserPlusIcon className="w-4 h-4" />
                {t("settings.family_invite_send")}
              </button>
              <button onClick={handle_copy_link} disabled={invite_loading || has_pending_link} className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50" title={has_pending_link ? "Revoke the existing link first" : undefined}>
                <LinkIcon className="w-4 h-4" />
                {t("settings.family_invite_copy_link")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending invites ── */}
      {group.pending_invites.length > 0 && (
        <div>
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wide">{t("settings.family_invite_pending")}</h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="divide-y divide-edge-secondary">
            {group.pending_invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-txt-primary">{inv.link_only ? t("settings.family_invite_link") : t("settings.family_invite_by_email")}</p>
                  <p className="text-xs text-txt-muted">{t("settings.family_invite_expires", { date: new Date(inv.expires_at).toLocaleDateString() })}</p>
                </div>
                {is_owner && (
                  <button onClick={() => handle_revoke_invite(inv.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600">
                    {t("settings.family_invite_revoke")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── What's included ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
            <EnvelopeIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
            What's included
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-2">
          {["Unlimited email aliases per member","30 custom domains per member","End-to-end encrypted email","Quantum-safe internal mail","Shared family aliases","Full IMAP/SMTP per member","Catch-all email address","Auto-forwarding rules","Priority support","Email import & export","Admin storage controls","Admin role transfer"].map((feat) => (
            <div key={feat} className="flex items-center gap-2 text-xs text-txt-secondary">
              <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--accent-blue)" }} />
              {feat}
            </div>
          ))}
        </div>
      </div>

      {/* ── Change plan ── */}
      {is_owner && (
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
              <ArrowsRightLeftIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
              Change plan
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="py-2 space-y-3">
            <p className="text-xs text-txt-muted">Switch to a different plan. Your billing is prorated.</p>
            <div className="flex flex-wrap gap-2">
              {group.plan_name === "Family" && (
                <button onClick={() => handle_change_to_individual("duo")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Duo</button>
              )}
              <button onClick={() => handle_change_to_individual("supernova")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Supernova</button>
              <button onClick={() => handle_change_to_individual("nova")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Nova</button>
            </div>
          </div>
        </div>
      )}

      {!is_owner && (
        <button
          onClick={() => set_show_leave_dialog(true)}
          className="aster_btn aster_btn_destructive aster_btn_sm"
        >
          {t("settings.family_leave")}
        </button>
      )}
      </>)}

      {/* Dialogs rendered outside view-tab so state isn't lost on tab switch */}
      <AlertDialog
        open={!!remove_target}
        onOpenChange={(open) => !open && set_remove_target(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_remove_confirm_title", {
                name: remove_target?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_remove_confirm_body", {
                name: remove_target?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handle_remove_confirm}
              disabled={action_loading}
              className="aster_btn_destructive"
            >
              {t("settings.family_remove_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!transfer_target}
        onOpenChange={(open) => !open && set_transfer_target(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_transfer_confirm_title", {
                name: transfer_target?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_transfer_confirm_body", {
                name: transfer_target?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handle_transfer_confirm}
              disabled={action_loading}
            >
              {t("settings.family_transfer_confirm_action")}
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
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handle_leave_confirm}
              disabled={action_loading}
              className="aster_btn_destructive"
            >
              {t("settings.family_leave_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
