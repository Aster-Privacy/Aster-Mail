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
  UserPlusIcon,
  UserGroupIcon,
  Squares2X2Icon,
  LinkIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  ArrowRightIcon,
  PencilIcon,
  XMarkIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  PlusIcon,
  InformationCircleIcon,
  GlobeAltIcon,
  FunnelIcon,
  ChartBarIcon,
  ArrowsRightLeftIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { TurnstileWidget, type TurnstileWidgetRef, TURNSTILE_SITE_KEY } from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch, Button } from "@aster/ui";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { change_plan } from "@/services/api/billing";
import {
  list_org_groups, create_org_group, delete_org_group,
  list_group_members, add_group_member, remove_group_member,
  get_activity_log,
  list_org_filters, create_org_filter, update_org_filter, delete_org_filter,
  list_family_domains, share_domain, revoke_domain_share,
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  get_member_compliance, notify_non_compliant_2fa,
  create_consent_request, list_member_consent_requests, respond_consent_request,
  type OrgGroup, type OrgGroupMember, type OrgFilter, type FamilyDomain,
  type ActivityLogEntry, type DataRetentionPolicy, type SecurityPolicy,
  type MemberComplianceInfo, type ConsentKind, type MemberConsentRequest,
} from "@/services/api/family_org";
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
import { KidsContent } from "./family_kids_addresses";
import { show_toast } from "@/components/toast/simple_toast";
import { check_alias_availability } from "@/services/api/aliases";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import { format_bytes } from "@/lib/utils";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
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

type FamilyTab = "overview" | "members" | "kids" | "groups" | "activity" | "filters" | "domains" | "security" | "retention";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function event_labels(t: TFn): Record<string, string> {
  return {
    member_joined: t("settings.fam_org_event_member_joined"),
    member_removed: t("settings.fam_org_event_member_removed"),
    member_left: t("settings.fam_org_event_member_left"),
    admin_transferred: t("settings.fam_org_event_admin_transferred"),
    group_created: t("settings.fam_org_event_group_created"),
    group_deleted: t("settings.fam_org_event_group_deleted"),
    group_member_added: t("settings.fam_org_event_group_member_added"),
    group_member_removed: t("settings.fam_org_event_group_member_removed"),
    filter_created: t("settings.fam_org_event_filter_created"),
    domain_shared: t("settings.fam_org_event_domain_shared"),
    retention_updated: t("settings.fam_org_event_retention_updated"),
    security_policy_updated: t("settings.fam_org_event_security_policy_updated"),
    invite_sent: t("settings.fam_org_event_invite_sent"),
    invite_revoked: t("settings.fam_org_event_invite_revoked"),
    storage_updated: t("settings.fam_org_event_storage_updated"),
    security_notify_sent: t("settings.fam_org_event_security_notify_sent"),
  };
}

interface FamilySectionProps {
  is_family_plan: boolean;
}

function storage_pct(used: number, total: number) {
  return total > 0 ? Math.min(100, (used / total) * 100) : 0;
}

function last_seen_relative(iso: string | null | undefined, t: TFn): string {
  if (!iso) return t("settings.fam_org_time_never_seen");
  const diff_ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff_ms / 60000);
  if (mins < 2) return t("settings.fam_org_time_just_now");
  if (mins < 60) return t("settings.fam_org_time_minutes", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t(hrs === 1 ? "settings.fam_org_time_hour" : "settings.fam_org_time_hours", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days === 1) return t("settings.fam_org_time_yesterday");
  if (days < 30) return t("settings.fam_org_time_days", { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t(months === 1 ? "settings.fam_org_time_month" : "settings.fam_org_time_months", { count: months });
  const years = Math.floor(months / 12);
  return t(years === 1 ? "settings.fam_org_time_year" : "settings.fam_org_time_years", { count: years });
}

function invite_sent_relative(iso: string, t: TFn): string {
  const diff_ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff_ms / 86400000);
  if (days < 1) return t("settings.fam_org_time_today");
  if (days === 1) return t("settings.fam_org_time_one_day_ago");
  return t("settings.fam_org_time_days", { count: days });
}

function format_activity_time(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function activity_event_text(t: TFn, entry: { event_type: string; actor_username: string | null; target_username: string | null }): string {
  const actor = entry.actor_username ?? t("settings.fam_org_activity_someone");
  const target = entry.target_username;
  switch (entry.event_type) {
    case "member_joined": return target ? t("settings.fam_org_activity_member_joined", { target }) : t("settings.fam_org_activity_member_joined_generic");
    case "member_removed": return target ? t("settings.fam_org_activity_member_removed", { actor, target }) : t("settings.fam_org_activity_member_removed_generic", { actor });
    case "member_left": return target ? t("settings.fam_org_activity_member_left", { target }) : t("settings.fam_org_activity_member_left_generic");
    case "admin_transferred": return target ? t("settings.fam_org_activity_admin_transferred", { actor, target }) : t("settings.fam_org_activity_admin_transferred_generic", { actor });
    case "group_created": return t("settings.fam_org_activity_group_created", { actor });
    case "group_deleted": return t("settings.fam_org_activity_group_deleted", { actor });
    case "filter_created": return t("settings.fam_org_activity_filter_created", { actor });
    case "domain_shared": return target ? t("settings.fam_org_activity_domain_shared", { actor, target }) : t("settings.fam_org_activity_domain_shared_generic", { actor });
    case "retention_updated": return t("settings.fam_org_activity_retention_updated", { actor });
    case "security_policy_updated": return t("settings.fam_org_activity_security_policy_updated", { actor });
    case "security_notify_sent": return t("settings.fam_org_activity_security_notify_sent", { actor });
    case "invite_sent": return target ? t("settings.fam_org_activity_invite_sent", { actor, target }) : t("settings.fam_org_activity_invite_sent_generic", { actor });
    case "invite_revoked": return target ? t("settings.fam_org_activity_invite_revoked", { actor, target }) : t("settings.fam_org_activity_invite_revoked_generic", { actor });
    case "storage_updated": return target ? t("settings.fam_org_activity_storage_updated", { actor, target }) : t("settings.fam_org_activity_storage_updated_generic", { actor });
    default: return event_labels(t)[entry.event_type] ?? entry.event_type;
  }
}

function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = storage_pct(used, total);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent-blue";
  return (
    <div className="w-full bg-edge-secondary rounded-full h-1 mt-1.5">
      <div className={`${color} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SkeletonRows({ count = 3, has_icon = true }: { count?: number; has_icon?: boolean }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {has_icon && <div className="w-8 h-8 rounded-full bg-edge-secondary animate-pulse flex-shrink-0" />}
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-edge-secondary rounded-full animate-pulse" style={{ width: `${60 + (i % 3) * 10}%` }} />
            <div className="h-2 bg-edge-secondary rounded-full animate-pulse" style={{ width: `${35 + (i % 2) * 15}%` }} />
          </div>
          <div className="h-2 bg-edge-secondary rounded-full animate-pulse w-16 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

function MemberRow({ member, is_owner_view, compliance, pool_remaining_bytes, on_remove, on_transfer, on_reload }: {
  member: FamilyMemberInfo;
  is_owner_view: boolean;
  compliance?: MemberComplianceInfo;
  pool_remaining_bytes?: number;
  on_remove: (m: FamilyMemberInfo) => void;
  on_transfer: (m: FamilyMemberInfo) => void;
  on_reload: () => Promise<void>;
}) {
  const { t } = use_i18n();
  const [editing, set_editing] = useState(false);
  const [storage_input, set_storage_input] = useState(
    String(Math.round(member.allocated_storage_bytes / 1073741824))
  );

  const [saving_storage, set_saving_storage] = useState(false);
  const save_storage = useCallback(async () => {
    const gb = parseFloat(storage_input);
    if (isNaN(gb) || gb < 1) return;
    set_saving_storage(true);
    try {
      const r = await update_member_storage(member.user_id, Math.round(gb * 1073741824));
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      show_toast(t("settings.fam_org_member_storage_updated"), "success");
      set_editing(false);
      await on_reload();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_saving_storage(false); }
  }, [storage_input, member.user_id, on_reload, t]);

  const badge_class = member.role === "owner" ? "aster_badge aster_badge_blue"
    : member.status === "grace" ? "aster_badge aster_badge_amber"
    : "aster_badge aster_badge_gray";
  const role_label = member.role === "owner" ? t("settings.family_member_owner")
    : member.status === "grace" ? t("settings.family_member_grace")
    : t("settings.family_member_member");

  const no_2fa = compliance && !compliance.has_2fa && member.role !== "owner";

  return (
    <div className="flex items-center gap-3 py-3">
      <ProfileAvatar
        email={`${member.username}@${member.email_domain}`}
        name={member.username}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-txt-primary truncate">{member.username}@{member.email_domain}</span>
          <span className={badge_class}>{role_label}</span>
          {no_2fa && <span className="aster_badge aster_badge_amber">{t("settings.fam_org_member_no_2fa")}</span>}
          {compliance?.has_2fa && <ShieldCheckIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
        </div>
        {editing ? (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={String(Math.max(1, Math.ceil(member.storage_used_bytes / 1073741824)))}
                max={String(Math.max(
                    Math.round((member.allocated_storage_bytes + (pool_remaining_bytes ?? 0)) / 1073741824),
                    Math.round(member.allocated_storage_bytes / 1073741824) + 1
                  ))}
                value={storage_input}
                onChange={e => set_storage_input(e.target.value)}
                className="flex-1 h-1.5 accent-blue-500"
              />
              <span className="text-xs font-semibold text-txt-primary w-12 text-right">{storage_input} GB</span>
            </div>
            {pool_remaining_bytes !== undefined && (
              <p className="text-[10px] text-txt-muted">
                {t("settings.fam_org_member_pool_remaining", { count: Math.max(0, Math.round(((pool_remaining_bytes ?? 0) / 1073741824) - (parseFloat(storage_input) - member.allocated_storage_bytes / 1073741824))) })}
              </p>
            )}
            <div className="flex gap-1">
              <button onClick={save_storage} disabled={saving_storage} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50 flex items-center gap-1">
                {saving_storage ? <Spinner size="sm" /> : t("settings.fam_org_member_save")}
              </button>
              <button onClick={() => set_editing(false)} className="aster_btn aster_btn_ghost aster_btn_sm">{t("settings.fam_org_member_cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-txt-muted mt-0.5">{format_bytes(member.storage_used_bytes)} / {format_bytes(member.allocated_storage_bytes)}</div>
        )}
        {!editing && <StorageBar used={member.storage_used_bytes} total={member.allocated_storage_bytes} />}
      </div>
      {is_owner_view && member.role !== "owner" && !editing && (
        <div className="flex items-center gap-1 flex-shrink-0 self-center">
          <button onClick={() => set_editing(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-txt-primary" title={t("settings.family_storage_edit")} aria-label={t("settings.family_storage_edit")}>
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={() => on_transfer(member)} className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent-blue" title={t("settings.family_transfer_admin")} aria-label={t("settings.family_transfer_admin")}>
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
          <button onClick={() => on_remove(member)} className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-red-500" title={t("settings.family_remove_member")} aria-label={t("settings.family_remove_member")}>
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MemberGroupsContent() {
  const { t } = use_i18n();
  const [my_groups, set_my_groups] = useState<import("@/services/api/family_org").MemberGroup[]>([]);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    import("@/services/api/family_org").then(m => m.list_my_groups()).then(r => {
      if (r.data) set_my_groups(r.data);
    }).catch(() => {}).finally(() => set_loading(false));
  }, []);

  if (loading) return <SkeletonRows count={2} has_icon={false} />;

  if (my_groups.length === 0) return (
    <div className="flex flex-col items-center py-10 gap-3">
      <UserGroupIcon className="w-12 h-12 text-txt-muted" />
      <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_member_groups_empty_title")}</p>
      <p className="text-xs text-txt-muted text-center max-w-xs">{t("settings.fam_org_member_groups_empty_desc")}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {my_groups.map(g => (
        <div key={g.id} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-edge-secondary">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-accent-blue/10 flex-shrink-0">
            <UserGroupIcon className="w-4 h-4 text-accent-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-txt-primary truncate">{g.name}</p>
            {g.email_local_part && g.domain_name && (
              <p className="text-xs font-mono text-txt-muted mt-0.5">{g.email_local_part}@{g.domain_name}</p>
            )}
          </div>
          {g.email_local_part && g.domain_name && (
            <span className="aster_badge aster_badge_blue shrink-0">{t("settings.fam_org_groups_has_email_title")}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function GroupsContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [groups, set_groups] = useState<OrgGroup[]>([]);
  const [loading, set_loading] = useState(true);
  const [new_name, set_new_name] = useState("");
  const [new_email_prefix, set_new_email_prefix] = useState("");
  const [new_domain, set_new_domain] = useState("astermail.org");
  const [domains, set_domains] = useState<string[]>(["astermail.org"]);
  const [creating, set_creating] = useState(false);
  const [expanded, set_expanded] = useState<string | null>(null);
  const [group_members, set_group_members] = useState<Record<string, OrgGroupMember[]>>({});
  const [adding_to, set_adding_to] = useState<string | null>(null);
  const [add_user_id, set_add_user_id] = useState("");
  const [member_search, set_member_search] = useState("");

  const load_groups = useCallback(async () => {
    set_loading(true);
    try {
      const r = await list_org_groups();
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); } else { set_groups(r.data ?? []); }
    }
    catch { show_toast(t("settings.fam_org_groups_load_failed"), "error"); }
    finally { set_loading(false); }
  }, [t]);

  useEffect(() => {
    load_groups();
    import("@/services/api/domains").then(m => m.list_domains()).then(r => {
      const active_custom = (r.data?.domains ?? [])
        .filter(d => d.status === "active")
        .map(d => d.domain_name)
        .filter(n => n !== "astermail.org" && n !== "aster.cx");
      set_domains(["astermail.org", "aster.cx", ...active_custom]);
    }).catch(() => {});
  }, [load_groups]);

  const handle_expand = async (gid: string) => {
    if (expanded === gid) { set_expanded(null); return; }
    set_expanded(gid);
    if (!group_members[gid]) {
      try {
        const r = await list_group_members(gid);
        if (r.data) set_group_members(p => ({ ...p, [gid]: r.data! }));
        else show_toast(t("settings.fam_org_groups_members_load_failed"), "error");
      }
      catch { show_toast(t("settings.fam_org_groups_members_load_failed"), "error"); }
    }
  };

  const handle_create = async () => {
    if (!new_name.trim() || creating) return;
    set_creating(true);
    try {
      const payload: { name: string; email_local_part?: string; domain_name?: string } = { name: new_name.trim() };
      if (new_email_prefix.trim() && new_domain) {
        const trimmed_prefix = new_email_prefix.trim().toLowerCase();
        const availability = await check_alias_availability(trimmed_prefix, new_domain);
        if (!availability.data?.available) {
          show_toast(t("settings.fam_org_groups_address_in_use"), "error");
          set_creating(false);
          return;
        }
        payload.email_local_part = trimmed_prefix;
        payload.domain_name = new_domain;
      }
      const r = await create_org_group(payload);
      if (r.data) { set_groups(p => [...p, r.data!]); set_new_name(""); set_new_email_prefix(""); set_new_domain("astermail.org"); show_toast(t("settings.fam_org_groups_created"), "success"); }
      else if ((r as { status?: number }).status === 409) { show_toast(t("settings.fam_org_groups_address_in_use"), "error"); }
      else { show_toast(t("settings.fam_org_groups_create_failed"), "error"); }
    } catch { show_toast(t("settings.fam_org_groups_create_failed"), "error"); }
    finally { set_creating(false); }
  };

  const [address_available, set_address_available] = useState<boolean | null>(null);

  useEffect(() => {
    if (!new_email_prefix || new_email_prefix.length < 2) { set_address_available(null); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await check_alias_availability(new_email_prefix, new_domain);
        set_address_available(r.data?.available ?? null);
      } catch { set_address_available(null); }
    }, 400);
    return () => clearTimeout(timer);
  }, [new_email_prefix, new_domain]);

  const [confirm_delete_gid, set_confirm_delete_gid] = useState<string | null>(null);

  const handle_delete = (gid: string) => { set_confirm_delete_gid(gid); };
  const confirm_delete = async () => {
    if (!confirm_delete_gid) return;
    try {
      const r = await delete_org_group(confirm_delete_gid);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); }
      else { set_groups(p => p.filter(g => g.id !== confirm_delete_gid)); if (expanded === confirm_delete_gid) set_expanded(null); show_toast(t("settings.fam_org_groups_deleted"), "success"); }
    }
    catch { show_toast(t("settings.fam_org_groups_delete_failed"), "error"); }
    finally { set_confirm_delete_gid(null); }
  };

  const handle_remove_member = async (gid: string, uid: string) => {
    try {
      const r = await remove_group_member(gid, uid);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      set_group_members(p => ({ ...p, [gid]: (p[gid] ?? []).filter(m => m.user_id !== uid) }));
      set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: g.member_count - 1 } : g));
      show_toast(t("settings.fam_org_groups_member_removed"), "success");
    } catch { show_toast(t("settings.fam_org_groups_remove_failed"), "error"); }
  };

  const handle_add_member = async (gid: string) => {
    if (!add_user_id) return;
    const member = members.find(m => m.user_id === add_user_id);
    if (!member) return;
    const optimistic: OrgGroupMember = { user_id: member.user_id, username: member.username, email_domain: member.email_domain, added_at: new Date().toISOString() };
    set_group_members(p => ({ ...p, [gid]: [...(p[gid] ?? []), optimistic] }));
    set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: g.member_count + 1 } : g));
    set_adding_to(null); set_add_user_id(""); set_member_search("");
    try {
      const r = await add_group_member(gid, add_user_id);
      if (r.error) {
        set_group_members(p => ({ ...p, [gid]: (p[gid] ?? []).filter(m => m.user_id !== add_user_id) }));
        set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
        show_toast(t("settings.fam_org_action_failed"), "error");
      } else {
        show_toast(t("settings.fam_org_groups_member_added"), "success");
      }
    } catch {
      set_group_members(p => ({ ...p, [gid]: (p[gid] ?? []).filter(m => m.user_id !== add_user_id) }));
      set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
      show_toast(t("settings.fam_org_groups_add_failed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-start">
        <Input placeholder={t("settings.fam_org_groups_name_placeholder")} value={new_name} onChange={e => set_new_name(e.target.value)} onKeyDown={e => e.key === "Enter" && handle_create()} className="flex-1" size="md" />
        <div className={`flex items-center h-9 rounded-xl border bg-white dark:bg-white/[0.04] overflow-hidden flex-1 min-w-0 ${address_available === true ? "border-green-500" : address_available === false ? "border-red-500" : "border-black/10 dark:border-white/10"}`}>
          <input
            className="bg-transparent text-sm text-txt-primary outline-none px-3 h-full flex-1 min-w-0 placeholder:text-txt-muted"
            placeholder={t("settings.fam_org_groups_prefix_placeholder")}
            value={new_email_prefix}
            onChange={e => { set_new_email_prefix(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "")); set_address_available(null); }}
          />
          <span className="text-txt-muted text-sm px-1 select-none shrink-0">@</span>
          <Select value={new_domain} onValueChange={set_new_domain}>
            <SelectTrigger className="border-0 border-l border-black/10 dark:border-white/10 rounded-none bg-transparent h-full shadow-none text-sm min-w-0 max-w-[160px] px-2">
              <SelectValue placeholder={t("settings.fam_org_groups_domain_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {domains.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="depth" size="md" onClick={handle_create} disabled={creating || !new_name.trim()}>
          <PlusIcon className="w-4 h-4" /> {t("settings.fam_org_groups_create")}
        </Button>
      </div>
      <p className="text-[11px] text-txt-muted flex items-center gap-1.5">
        <InfoPopover title={t("settings.fam_org_groups_info_title")} description={t("settings.fam_org_groups_info_desc")} />
        {new_email_prefix.trim()
          ? <><span className="text-txt-muted">{t("settings.fam_org_groups_address_preview")}</span><span className="font-mono text-accent-blue">{new_email_prefix.trim()}@{new_domain}</span></>
          : <span className="text-txt-muted">{t("settings.fam_org_groups_prefix_hint")}</span>
        }
      </p>
      {loading ? (
        <SkeletonRows count={3} has_icon={false} />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <UserGroupIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_groups_empty_title")}</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">{t("settings.fam_org_groups_empty_desc")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const is_open = expanded === g.id;
            const gm = group_members[g.id] ?? [];
            const loading_members = is_open && !group_members[g.id];
            return (
              <div key={g.id} className="rounded-xl border border-edge-secondary overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => handle_expand(g.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <ChevronRightIcon className={`w-3.5 h-3.5 text-txt-muted flex-shrink-0 transition-transform duration-200 ${is_open ? "rotate-90" : ""}`} />
                    <span className="text-sm font-medium text-txt-primary truncate">{g.name}</span>
                    {g.email_local_part && (
                      <span className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        {g.email_local_part}{g.domain_name ? `@${g.domain_name}` : t("settings.fam_org_groups_default_domain")}
                      </span>
                    )}
                  </button>
                  <span className="aster_badge aster_badge_gray flex-shrink-0 text-xs">{g.member_count}</span>
                  <button
                    onClick={() => handle_delete(g.id)}
                    className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1 text-txt-muted hover:text-red-500 flex-shrink-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {is_open && (
                  <div className="border-t border-edge-secondary px-4 py-3 space-y-2">
                    {loading_members ? (
                      <div className="flex items-center gap-2 py-2">
                        <Spinner size="sm" />
                        <span className="text-xs text-txt-muted">{t("settings.fam_org_domains_loading")}</span>
                      </div>
                    ) : gm.length === 0 && adding_to !== g.id ? (
                      <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <UserGroupIcon className="w-8 h-8 text-txt-muted" />
                        <p className="text-xs text-txt-muted">{t("settings.fam_org_groups_no_members")}</p>
                        <Button size="sm" variant="outline" onClick={() => { set_adding_to(g.id); set_add_user_id(""); set_member_search(""); }}>
                          <PlusIcon className="w-3.5 h-3.5" /> {t("settings.fam_org_groups_add_member")}
                        </Button>
                      </div>
                    ) : gm.length > 0 ? (
                      <div className="space-y-1">
                        {gm.map(m => {
                          return (
                            <div key={m.user_id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surf-secondary transition-colors">
                              <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="xs" />
                              <span className="text-sm text-txt-primary flex-1 min-w-0 truncate">{m.username}@{m.email_domain}</span>
                              <button
                                onClick={() => handle_remove_member(g.id, m.user_id)}
                                className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600 flex-shrink-0"
                              >
                                {t("settings.fam_org_groups_remove")}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {adding_to === g.id ? (
                      <div className="pt-2 space-y-2">
                        <Input
                          placeholder={t("settings.fam_org_groups_search_placeholder")}
                          value={member_search}
                          onChange={e => set_member_search(e.target.value)}
                          size="sm"
                          autoFocus
                        />
                        <div className="rounded-lg border border-edge-secondary overflow-hidden max-h-44 overflow-y-auto">
                          {members.filter(m => !gm.some(x => x.user_id === m.user_id) && (
                            !member_search || `${m.username}@${m.email_domain}`.toLowerCase().includes(member_search.toLowerCase())
                          )).length === 0 ? (
                            <p className="text-xs text-txt-muted text-center py-3 px-3">{t("settings.fam_org_groups_no_available")}</p>
                          ) : (
                            members.filter(m => !gm.some(x => x.user_id === m.user_id) && (
                              !member_search || `${m.username}@${m.email_domain}`.toLowerCase().includes(member_search.toLowerCase())
                            )).map(m => {
                              return (
                                <button
                                  key={m.user_id}
                                  onClick={() => set_add_user_id(prev => prev === m.user_id ? "" : m.user_id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${add_user_id === m.user_id ? "bg-accent-blue/10" : ""}`}
                                >
                                  <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="xs" />
                                  <span className="text-sm text-txt-primary flex-1 min-w-0 truncate">{m.username}@{m.email_domain}</span>
                                  {add_user_id === m.user_id && <CheckCircleIcon className="w-4 h-4 text-accent-blue flex-shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                        <div className="flex gap-2 pt-0.5">
                          <Button size="sm" variant="depth" onClick={() => handle_add_member(g.id)} disabled={!add_user_id} className="flex-1">
                            {t("settings.fam_org_groups_add")}
                          </Button>
                          <button onClick={() => { set_adding_to(null); set_add_user_id(""); set_member_search(""); }} className="px-3 py-1.5 text-sm text-txt-muted hover:text-txt-primary rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            {t("settings.fam_org_groups_cancel")}
                          </button>
                        </div>
                      </div>
                    ) : gm.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => { set_adding_to(g.id); set_add_user_id(""); set_member_search(""); }}>
                        <PlusIcon className="w-3.5 h-3.5" /> {t("settings.fam_org_groups_add_member")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirm_delete_gid} onOpenChange={open => !open && set_confirm_delete_gid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.fam_org_groups_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.fam_org_groups_delete_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.fam_org_groups_cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm_delete} className="aster_btn_destructive">
              {t("settings.fam_org_groups_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivityContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");
  const [search, set_search] = useState("");

  const load_page = useCallback(async (p: number, ft?: string) => {
    set_loading(true);
    try {
      const r = await get_activity_log(p, 20, ft);
      if (r.data) {
        if (p === 1) set_entries(r.data.entries); else set_entries(prev => [...prev, ...r.data!.entries]);
        set_total(r.data.total); set_page(p);
      } else if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); }
    } catch { show_toast(t("settings.fam_org_activity_load_failed"), "error"); }
    finally { set_loading(false); }
  }, [t]);

  useEffect(() => { load_page(1, filter_type || undefined); }, [load_page, filter_type]);

  const filtered_entries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      (e.actor_username ?? "").toLowerCase().includes(q) ||
      (e.target_username ?? "").toLowerCase().includes(q) ||
      (event_labels(t)[e.event_type] ?? e.event_type).toLowerCase().includes(q)
    );
  }, [entries, search, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder={t("settings.fam_org_activity_search_placeholder")}
          value={search}
          onChange={e => set_search(e.target.value)}
          size="sm"
          className="flex-1"
        />
        <Select value={filter_type || "all"} onValueChange={v => set_filter_type(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("settings.fam_org_activity_all_events")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("settings.fam_org_activity_all_events")}</SelectItem>
            {Object.entries(event_labels(t)).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-sm text-txt-muted">{total !== 1 ? t("settings.fam_org_activity_events_plural", { count: total }) : t("settings.fam_org_activity_events", { count: total })}</span>
      {loading && entries.length === 0 ? (
        <SkeletonRows count={4} />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <ChartBarIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_activity_empty_title")}</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">{t("settings.fam_org_activity_empty_desc")}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-left">
            {[t("settings.fam_org_activity_cat_member_joins"), t("settings.fam_org_activity_cat_security_changes"), t("settings.fam_org_activity_cat_filter_updates"), t("settings.fam_org_activity_cat_domain_sharing"), t("settings.fam_org_activity_cat_storage_changes"), t("settings.fam_org_activity_cat_invite_activity")].map(e => (
              <div key={e} className="flex items-center gap-1.5 text-xs text-txt-muted">
                <div className="w-1 h-1 rounded-full bg-edge-secondary flex-shrink-0" />
                {e}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {filtered_entries.map(entry => {
            const actor_member = entry.actor_username ? members.find(m => m.username === entry.actor_username) : null;
            const actor_email = actor_member ? `${actor_member.username}@${actor_member.email_domain}` : entry.actor_username ? `${entry.actor_username}@astermail.org` : null;
            return (
            <div key={entry.id} className="flex items-center gap-3 py-3">
              {actor_email && (
                <ProfileAvatar email={actor_email} name={entry.actor_username!} size="sm" className="flex-shrink-0" />
              )}
              {!entry.actor_username && (
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-edge-secondary" />
                </div>
              )}
              <div className="flex-shrink-0">
                {['member_joined','invite_sent'].includes(entry.event_type) ? <UserPlusIcon className="w-5 h-5 text-txt-muted" /> :
                 ['member_removed','invite_revoked','group_deleted'].includes(entry.event_type) ? <TrashIcon className="w-5 h-5 text-txt-muted" /> :
                 ['admin_transferred','storage_updated'].includes(entry.event_type) ? <ArrowsRightLeftIcon className="w-5 h-5 text-txt-muted" /> :
                 ['security_policy_updated','security_notify_sent'].includes(entry.event_type) ? <ShieldCheckIcon className="w-5 h-5 text-txt-muted" /> :
                 ['retention_updated'].includes(entry.event_type) ? <ArchiveBoxIcon className="w-5 h-5 text-txt-muted" /> :
                 ['domain_shared'].includes(entry.event_type) ? <GlobeAltIcon className="w-5 h-5 text-txt-muted" /> :
                 <PlusIcon className="w-5 h-5 text-txt-muted" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-txt-primary">{activity_event_text(t, entry)}</span>
                <p className="text-xs text-txt-muted mt-0.5" title={format_activity_time(entry.created_at)}>{last_seen_relative(entry.created_at, t)}</p>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {entries.length < total && (
        <button onClick={() => load_page(page + 1, filter_type || undefined)} disabled={loading} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">
          {loading ? <Spinner size="sm" /> : t("settings.fam_org_activity_load_more")}
        </button>
      )}
    </div>
  );
}

const FILTER_FIELD_COLORS: Record<string, string> = {
  from: "#6366f1",
  domain: "#8b5cf6",
  to: "#3b82f6",
  subject: "#f59e0b",
  ip: "#0ea5e9",
};

function filter_field_labels(t: TFn): Record<string, string> {
  return {
    from: t("settings.fam_org_filter_field_from"),
    to: t("settings.fam_org_filter_field_to"),
    domain: t("settings.fam_org_filter_field_domain"),
    subject: t("settings.fam_org_filter_field_subject"),
    ip: t("settings.fam_org_filter_field_ip"),
  };
}

function filter_action_labels(t: TFn): Record<string, string> {
  return {
    trash: t("settings.fam_org_filter_action_trash"),
    block: t("settings.fam_org_filter_action_block"),
    archive: t("settings.fam_org_filter_action_archive"),
    tag: t("settings.fam_org_filter_action_tag"),
    redirect: t("settings.fam_org_filter_action_redirect"),
  };
}

const FILTER_ACTION_COLORS: Record<string, string> = {
  trash: "#ef4444",
  block: "#ef4444",
  archive: "#6366f1",
  tag: "#f59e0b",
  redirect: "#8b5cf6",
};

interface FilterCardProps {
  filter: OrgFilter;
  on_toggle: (f: OrgFilter) => void;
  on_delete: (id: string) => void;
}

function FilterCard({ filter, on_toggle, on_delete }: FilterCardProps) {
  const { t } = use_i18n();
  const dot_color = FILTER_FIELD_COLORS[filter.field] ?? "#a3a3a3";
  const action_color = FILTER_ACTION_COLORS[filter.action] ?? "#a3a3a3";
  const action_label = filter_action_labels(t)[filter.action] ?? filter.action;
  const field_label = filter_field_labels(t)[filter.field] ?? filter.field;

  return (
    <div
      className={`group relative rounded-xl border bg-surf-primary p-4 transition-colors border-neutral-200 dark:border-neutral-700 hover:bg-surf-secondary hover:border-neutral-300 dark:hover:border-neutral-600${!filter.is_enabled ? " opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot_color }} />
            <span className="text-[13px] font-medium text-txt-primary truncate">{filter.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-stretch h-7 rounded-[12px] border bg-transparent border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <span className="h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200 rounded-l-[11px]">
                {field_label}
              </span>
              <span className="h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200 border-l border-neutral-200 dark:border-neutral-700">
                <span className="truncate max-w-[200px]">{filter.value}</span>
              </span>
            </span>
            <span className="text-neutral-400 text-[12px] px-0.5">→</span>
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[12px] text-[12.5px] font-medium text-white"
              style={{ backgroundColor: action_color }}
            >
              {action_label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); on_toggle(filter); }}
            className="p-1.5 text-txt-muted hover:text-txt-primary"
            title={filter.is_enabled ? t("settings.fam_org_filter_disable") : t("settings.fam_org_filter_enable")}
          >
            {filter.is_enabled
              ? <CheckCircleIcon className="w-4 h-4" style={{ color: "var(--accent-blue)" }} />
              : <XCircleIcon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); on_delete(filter.id); }}
            className="p-1.5 text-txt-muted hover:text-red-500"
            title={t("settings.fam_org_filter_delete")}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConsentGateDialogProps {
  open: boolean;
  on_close: () => void;
  kind: ConsentKind;
  description: string;
  payload: unknown;
  member_count: number;
  on_sent: () => void;
}

function ConsentGateDialog({ open, on_close, kind, description, payload, member_count, on_sent }: ConsentGateDialogProps) {
  const { t } = use_i18n();
  const [sending, set_sending] = useState(false);

  const send = async () => {
    set_sending(true);
    try {
      const r = await create_consent_request(kind, description, payload);
      if (r.data) {
        show_toast(t("settings.fam_consent_sent_toast"), "success");
        on_sent();
        on_close();
      } else {
        show_toast(t("settings.fam_consent_send_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_consent_send_failed"), "error");
    } finally {
      set_sending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={open_val => !open_val && on_close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.fam_consent_title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.fam_consent_body", { count: member_count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-2">
          <div className="rounded-lg bg-surf-secondary border border-edge-secondary px-3 py-2 text-sm text-txt-secondary">
            {description}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={on_close}>{t("settings.fam_consent_cancel")}</AlertDialogCancel>
          <Button variant="depth" onClick={send} disabled={sending}>
            {sending ? <Spinner size="sm" /> : t("settings.fam_consent_send")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberConsentPanel() {
  const { t } = use_i18n();
  const [requests, set_requests] = useState<MemberConsentRequest[]>([]);
  const [responding, set_responding] = useState<string | null>(null);

  useEffect(() => {
    list_member_consent_requests()
      .then(r => { if (r.data) set_requests(r.data.filter(req => !req.responded)); })
      .catch(() => {});
  }, []);

  const respond = async (id: string, accepted: boolean) => {
    set_responding(id);
    try {
      const r = await respond_consent_request(id, accepted);
      if (!r.error) {
        set_requests(prev => prev.filter(req => req.id !== id));
        show_toast(accepted ? t("settings.fam_consent_member_accepted_toast") : t("settings.fam_consent_member_declined_toast"), "success");
      } else {
        show_toast(t("settings.fam_consent_send_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_consent_send_failed"), "error");
    } finally {
      set_responding(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-txt-primary">{t("settings.fam_consent_member_title")}</p>
      </div>
      <div className="space-y-2">
        {requests.map(req => (
          <div key={req.id} className="rounded-lg bg-surf-primary border border-edge-secondary p-3">
            <p className="text-xs text-txt-muted mb-1">{t("settings.fam_consent_member_from", { name: req.admin_username })}</p>
            <p className="text-sm text-txt-primary mb-3">{req.description}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="depth" disabled={responding === req.id} onClick={() => respond(req.id, true)}>
                {responding === req.id ? <Spinner size="sm" /> : t("settings.fam_consent_member_accept")}
              </Button>
              <Button size="sm" variant="outline" disabled={!!responding} onClick={() => respond(req.id, false)}>
                {t("settings.fam_consent_member_decline")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FiltersContent({ other_member_count, initial_filters }: { other_member_count: number; initial_filters?: OrgFilter[] | null }) {
  const { t } = use_i18n();
  const [filters, set_filters] = useState<OrgFilter[]>(initial_filters ?? []);
  const [loading, set_loading] = useState(!initial_filters);
  const [show_form, set_show_form] = useState(false);
  const [creating, set_creating] = useState(false);
  const [form, set_form] = useState({ name: "", value: "", field: "from", action: "trash" });
  const [consent_open, set_consent_open] = useState(false);
  const [consent_payload, set_consent_payload] = useState<unknown>(null);

  const load = useCallback(async () => {
    try { const r = await list_org_filters(); if (r.data) set_filters(r.data); }
    catch { show_toast(t("settings.fam_org_filters_load_failed"), "error"); }
    finally { set_loading(false); }
  }, [t]);
  useEffect(() => { if (!initial_filters) load(); }, [load, initial_filters]);

  const create = async () => {
    if (!form.name.trim() || !form.value.trim()) return;
    if (other_member_count > 0) {
      set_consent_payload({ name: form.name.trim(), filter_type: "block", field: form.field, value: form.value.trim(), action: form.action });
      set_consent_open(true);
      return;
    }
    set_creating(true);
    try {
      const r = await create_org_filter({ name: form.name.trim(), filter_type: "block", field: form.field, value: form.value.trim(), action: form.action });
      if (r.data) { set_filters(f => [...f, r.data!]); set_form({ name: "", value: "", field: "from", action: "trash" }); set_show_form(false); show_toast(t("settings.fam_org_filters_created"), "success"); }
    } catch { show_toast(t("settings.fam_org_filters_create_failed"), "error"); }
    finally { set_creating(false); }
  };

  const toggle_f = async (f: OrgFilter) => {
    if (!f.is_enabled && other_member_count > 0) {
      set_consent_payload({ id: f.id, is_enabled: true });
      set_consent_open(true);
      return;
    }
    try {
      const r = await update_org_filter(f.id, { is_enabled: !f.is_enabled });
      if (r.data) set_filters(fs => fs.map(x => x.id === f.id ? r.data! : x));
      else show_toast(t("settings.fam_org_filters_update_failed"), "error");
    } catch { show_toast(t("settings.fam_org_filters_update_failed"), "error"); }
  };

  const del_f = async (id: string) => {
    try {
      const r = await delete_org_filter(id);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      set_filters(f => f.filter(x => x.id !== id)); show_toast(t("settings.fam_org_filters_deleted"), "success");
    }
    catch { show_toast(t("settings.fam_org_filters_delete_failed"), "error"); }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <FunnelIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.fam_org_filters_heading")}
              <InfoPopover title={t("settings.fam_org_filters_info_title")} description={t("settings.fam_org_filters_info_desc")} />
              <span className="text-xs font-normal text-txt-muted">
                {loading ? "..." : filters.length}
              </span>
            </h3>
            <Button
              size="md"
              variant="depth"
              onClick={() => set_show_form(true)}
            >
              <PlusIcon className="w-4 h-4" />
              {t("settings.fam_org_filters_new")}
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.fam_org_filters_subtitle")}
        </p>
      </div>

      {loading && filters.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
          ))}
        </div>
      )}

      <Modal is_open={show_form} on_close={() => { set_show_form(false); set_form({ name: "", value: "", field: "from", action: "trash" }); }} size="md" close_on_overlay={false}>
        <ModalHeader>
          <ModalTitle>{t("settings.fam_org_filters_modal_title")}</ModalTitle>
          <ModalDescription>{t("settings.fam_org_filters_modal_desc")}</ModalDescription>
        </ModalHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">{t("settings.fam_org_filters_name_label")}</label>
            <Input placeholder={t("settings.fam_org_filters_name_placeholder")} value={form.name} onChange={e => set_form(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.fam_org_filters_condition_label")}
              <InfoPopover title={t("settings.fam_org_filters_condition_info_title")} description={t("settings.fam_org_filters_condition_info_desc")} />
            </label>
            <div className="flex gap-2">
              <Select value={form.field} onValueChange={v => set_form(f => ({ ...f, field: v }))}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="from">{t("settings.fam_org_filters_field_from_option")}</SelectItem>
                  <SelectItem value="to">{t("settings.fam_org_filters_field_to_option")}</SelectItem>
                  <SelectItem value="domain">{t("settings.fam_org_filters_field_domain_option")}</SelectItem>
                  <SelectItem value="subject">{t("settings.fam_org_filters_field_subject_option")}</SelectItem>
                  <SelectItem value="ip">{t("settings.fam_org_filters_field_ip_option")}</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder={t("settings.fam_org_filters_value_placeholder")} size="sm" className="flex-1" value={form.value} onChange={e => set_form(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.fam_org_filters_action_label")}
              <InfoPopover title={t("settings.fam_org_filters_action_info_title")} description={t("settings.fam_org_filters_action_info_desc")} />
            </label>
            <Select value={form.action} onValueChange={v => set_form(f => ({ ...f, action: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trash">{t("settings.fam_org_filters_action_trash_option")}</SelectItem>
                <SelectItem value="block">{t("settings.fam_org_filters_action_block_option")}</SelectItem>
                <SelectItem value="archive">{t("settings.fam_org_filters_action_archive_option")}</SelectItem>
                <SelectItem value="tag">{t("settings.fam_org_filters_action_tag_option")}</SelectItem>
                <SelectItem value="redirect">{t("settings.fam_org_filters_action_redirect_option")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => { set_show_form(false); set_form({ name: "", value: "", field: "from", action: "trash" }); }}>{t("settings.fam_org_filters_cancel")}</Button>
          <Button variant="depth" onClick={create} disabled={creating || !form.name.trim() || !form.value.trim()}>
            {creating ? <Spinner size="sm" /> : t("settings.fam_org_filters_create")}
          </Button>
        </ModalFooter>
      </Modal>

      {!loading && filters.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <FunnelIcon className="w-12 h-12 mx-auto mb-2 text-txt-tertiary" />
          <p className="text-sm text-txt-muted mb-1">{t("settings.fam_org_filters_empty_title")}</p>
          <p className="text-xs text-txt-muted">{t("settings.fam_org_filters_empty_desc")}</p>
        </div>
      )}

      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map(f => (
            <FilterCard
              key={f.id}
              filter={f}
              on_toggle={toggle_f}
              on_delete={del_f}
            />
          ))}
        </div>
      )}
      <ConsentGateDialog
        open={consent_open}
        on_close={() => { set_consent_open(false); set_consent_payload(null); }}
        kind="filter_create"
        description={t("settings.fam_consent_filter_create_desc")}
        payload={consent_payload}
        member_count={other_member_count}
        on_sent={() => { set_show_form(false); set_form({ name: "", value: "", field: "from", action: "trash" }); }}
      />
    </div>
  );
}

function DomainsContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [sharing, set_sharing] = useState<string | null>(null);
  const [share_uid, set_share_uid] = useState("");

  useEffect(() => {
    list_family_domains()
      .then(r => { if (r.data) set_domains(r.data); })
      .catch(() => show_toast(t("settings.fam_org_domains_load_failed"), "error"))
      .finally(() => set_loading(false));
  }, [t]);

  const do_share = async (dn: string) => {
    if (!share_uid) return;
    const uid = share_uid;
    try {
      const r = await share_domain(dn, uid, true);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      set_domains(d => d.map(x => x.domain_name === dn ? { ...x, shared_with_user_ids: x.shared_with_user_ids.includes(uid) ? x.shared_with_user_ids : [...x.shared_with_user_ids, uid], shared_with_count: (x.shared_with_user_ids.includes(uid) ? x.shared_with_user_ids.length : x.shared_with_user_ids.length + 1) } : x));
      set_sharing(null); set_share_uid(""); show_toast(t("settings.fam_org_domains_shared"), "success");
    } catch { show_toast(t("settings.fam_org_domains_share_failed"), "error"); }
  };

  const do_revoke = async (dn: string, uid: string) => {
    try {
      const r = await revoke_domain_share(dn, uid);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      set_domains(d => d.map(x => x.domain_name === dn ? { ...x, shared_with_user_ids: x.shared_with_user_ids.filter(id => id !== uid), shared_with_count: Math.max(0, x.shared_with_user_ids.filter(id => id !== uid).length) } : x));
      show_toast(t("settings.fam_org_domains_revoked"), "success");
    } catch { show_toast(t("settings.fam_org_domains_revoke_failed"), "error"); }
  };

  const nav_aliases = () => {
    try { sessionStorage.setItem("alias_tab", "domains"); } catch {}
    window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "aliases" }));
  };

  if (loading) return <div className="flex justify-center items-center gap-2 py-8"><Spinner size="sm" /><span className="text-sm text-txt-muted">{t("settings.fam_org_domains_loading")}</span></div>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">{t("settings.fam_org_domains_subtitle")}</p>
      {domains.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <GlobeAltIcon className="w-8 h-8 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_domains_empty_title")}</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">{t("settings.fam_org_domains_empty_desc")}</p>
          <button onClick={nav_aliases} className="aster_btn aster_btn_primary aster_btn_sm mt-1">
            {t("settings.fam_org_domains_add_domain")}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {domains.map(d => {
            return (
              <div key={d.domain_name} className="py-3 hover:bg-surf-secondary/50 transition-colors rounded-lg px-2 -mx-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar
                      email={(() => { const om = members.find(m => m.user_id === d.owner_user_id); return om ? `${om.username}@${om.email_domain}` : undefined; })()}
                      name={d.owner_username}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-txt-primary">{d.domain_name}</span>
                        {d.dkim_verified ? <span className="aster_badge aster_badge_green">{t("settings.fam_org_domains_verified")}</span> : <span className="aster_badge aster_badge_amber">{t("settings.fam_org_domains_unverified")}</span>}
                        {d.shared_with_user_ids.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            {d.shared_with_user_ids.map(uid => members.find(m => m.user_id === uid)).filter((m): m is FamilyMemberInfo => !!m).map(m => (
                              <div key={m.user_id} className="-ml-1 first:ml-0 ring-1 ring-edge-secondary rounded-full" title={`${m.username}@${m.email_domain}`}>
                                <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="xs" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-txt-muted mt-0.5">{t("settings.fam_org_domains_owned_by", { name: d.owner_username })}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!d.dkim_verified) {
                        show_toast(t("settings.fam_org_domains_share_disabled_title"), "error");
                        return;
                      }
                      set_sharing(d.domain_name);
                      set_share_uid("");
                    }}
                    className="text-sm text-accent-blue hover:underline flex-shrink-0 font-medium">
                    {t("settings.fam_org_domains_share")}
                  </button>
                </div>
                {sharing === d.domain_name && (
                  <div className="mt-3 ml-10 space-y-2">
                    <div className="flex gap-2">
                      <Select value={share_uid || "_none"} onValueChange={v => set_share_uid(v === "_none" ? "" : v)}>
                        <SelectTrigger className="flex-1 text-xs">
                          <SelectValue placeholder={t("settings.fam_org_domains_add_member_placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {members.filter(m => m.user_id !== d.owner_user_id).map(m => (
                            <SelectItem key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => do_share(d.domain_name)} disabled={!share_uid} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">{t("settings.fam_org_domains_add_btn")}</button>
                      <button onClick={() => set_sharing(null)} className="aster_btn aster_btn_ghost aster_btn_sm">{t("settings.fam_org_domains_done")}</button>
                    </div>
                    {d.shared_with_user_ids.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wide">{t("settings.fam_org_domains_shared_with")}</p>
                        {d.shared_with_user_ids.map(uid => members.find(m => m.user_id === uid)).filter((m): m is FamilyMemberInfo => !!m).map(m => (
                          <div key={m.user_id} className="flex items-center gap-2 py-0.5">
                            <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="xs" />
                            <span className="text-xs text-txt-primary flex-1 truncate">{m.username}@{m.email_domain}</span>
                            <button onClick={() => do_revoke(d.domain_name, m.user_id)} className="text-[10px] text-red-500 hover:underline flex-shrink-0">{t("settings.fam_org_domains_revoke")}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberSecurityView() {
  const { t } = use_i18n();
  const [policy, set_policy] = useState<SecurityPolicy | null>(null);

  useEffect(() => {
    get_security_policy()
      .then(r => { if (r.data) set_policy(r.data); })
      .catch(() => {});
  }, []);

  if (!policy) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
        <ShieldCheckIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
        <p className="text-xs text-txt-muted">{t("settings.fam_org_sec_member_notice")}</p>
      </div>
      <div className="divide-y divide-edge-secondary">
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_sec_require_2fa")}</p>
          <span className={policy.require_2fa ? "aster_badge aster_badge_green" : "aster_badge aster_badge_gray"}>
            {policy.require_2fa ? t("settings.fam_org_sec_confirm_on") : t("settings.fam_org_sec_confirm_off")}
          </span>
        </div>
        {policy.require_2fa && (
          <div className="flex items-center justify-between py-4">
            <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_sec_grace")}</p>
            <span className="text-sm text-txt-secondary">{policy.require_2fa_grace_days} {t("settings.fam_org_sec_days")}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_sec_max_sessions")}</p>
          <span className="text-sm text-txt-secondary">{policy.max_sessions_per_member ?? t("settings.fam_org_sec_no_limit")}</span>
        </div>
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_sec_auto_signout")}</p>
          <span className="text-sm text-txt-secondary">{policy.session_timeout_hours ? `${policy.session_timeout_hours}h` : t("settings.fam_org_sec_never")}</span>
        </div>
      </div>
    </div>
  );
}

function SecurityContent({ other_member_count, initial_security, initial_compliance }: { other_member_count: number; initial_security?: SecurityPolicy | null; initial_compliance?: MemberComplianceInfo[] | null }) {
  const { t } = use_i18n();
  const [committed, set_committed] = useState<SecurityPolicy | null>(initial_security ?? null);
  const [draft, set_draft] = useState<SecurityPolicy | null>(initial_security ?? null);
  const [compliance, set_compliance] = useState<MemberComplianceInfo[]>(initial_compliance ?? []);
  const [saving, set_saving] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const [consent_open, set_consent_open] = useState(false);
  const [reminding, set_reminding] = useState(false);
  const [reminder_sent, set_reminder_sent] = useState(false);
  const [banner_dismissed, set_banner_dismissed] = useState(() => {
    try { return localStorage.getItem("aster_family_2fa_banner_dismissed") === "1"; } catch { return false; }
  });

  const dismiss_banner = () => {
    try { localStorage.setItem("aster_family_2fa_banner_dismissed", "1"); } catch {}
    set_banner_dismissed(true);
  };

  useEffect(() => {
    if (initial_security && initial_compliance) return;
    if (!initial_security) {
      get_security_policy()
        .then(r => { if (r.data) { set_committed(r.data); set_draft(r.data); } })
        .catch(() => {
          const fallback = { require_2fa: false, require_2fa_grace_days: 7, allow_imap_smtp: true, max_sessions_per_member: null, session_timeout_hours: null, block_external_forwarding: false };
          show_toast(t("settings.fam_org_sec_load_failed"), "error");
          set_committed(fallback); set_draft(fallback);
        });
    }
    if (!initial_compliance) {
      get_member_compliance()
        .then(r => { if (r.data) set_compliance(r.data); })
        .catch(() => {});
    }
  }, []);

  const patch_draft = useCallback((p: Partial<SecurityPolicy>) => {
    set_draft(prev => prev ? { ...prev, ...p } : prev);
  }, []);

  const has_changes = committed && draft && JSON.stringify(committed) !== JSON.stringify(draft);

  const DATA_TOUCHING_FIELDS: (keyof SecurityPolicy)[] = ['require_2fa', 'require_2fa_grace_days', 'max_sessions_per_member', 'session_timeout_hours', 'block_external_forwarding'];
  const has_data_touching_changes = committed && draft && DATA_TOUCHING_FIELDS.some(k => committed[k] !== draft[k]);
  const needs_consent = other_member_count > 0 && !!has_data_touching_changes;

  const do_save = useCallback(async () => {
    if (!draft) return;
    set_saving(true);
    set_confirm_open(false);
    try {
      const r = await update_security_policy(draft);
      if (r.data) { set_committed(r.data); set_draft(r.data); show_toast(t("settings.fam_org_sec_saved"), "success"); }
      else { show_toast(t("settings.fam_org_sec_save_failed"), "error"); }
    } catch { show_toast(t("settings.fam_org_sec_save_failed"), "error"); }
    finally { set_saving(false); }
  }, [draft, t]);

  const policy = draft;

  if (!policy) return (
    <div className="flex justify-center items-center gap-2 py-8">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">{t("settings.fam_org_sec_loading")}</span>
    </div>
  );

  const non_2fa = compliance.filter(m => !m.has_2fa).length;
  const with_2fa = compliance.filter(m => m.has_2fa).length;
  const total_members = compliance.length;

  return (
    <div className="space-y-4">
      {total_members > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-txt-primary font-medium">{t("settings.fam_org_2fa_summary", { withCount: with_2fa, total: total_members })}</span>
            <span className="text-txt-muted text-xs font-semibold tabular-nums">{Math.round((with_2fa / total_members) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-edge-secondary rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${non_2fa === 0 ? "bg-green-500" : "bg-amber-500"}`}
              style={{ width: `${(with_2fa / total_members) * 100}%` }}
            />
          </div>
        </div>
      )}
      {non_2fa > 0 && !banner_dismissed && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "#ef4444", backgroundImage: "none", boxShadow: "none", border: "none" }}
        >
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-white" />
          <p className="text-sm font-semibold flex-1 min-w-0 text-white">
            {non_2fa !== 1 ? t("settings.fam_org_2fa_banner_plural", { count: non_2fa }) : t("settings.fam_org_2fa_banner", { count: non_2fa })}
          </p>
          <button
            className="text-xs font-semibold text-white hover:underline flex-shrink-0 disabled:opacity-60 disabled:no-underline disabled:cursor-default"
            disabled={reminding || reminder_sent}
            onClick={async () => {
              if (reminding) return;
              set_reminding(true);
              try {
                const r = await notify_non_compliant_2fa();
                if (r.data != null) {
                  set_reminder_sent(true);
                  show_toast(t("settings.fam_org_2fa_reminder_sent_toast", { count: r.data.notified }), "success");
                } else if (r.code === "RATE_LIMIT_EXCEEDED") {
                  set_reminder_sent(true);
                  show_toast(t("settings.fam_org_2fa_reminder_rate_limited"), "info");
                } else {
                  show_toast(t("settings.fam_org_2fa_reminder_failed"), "error");
                }
              } catch { show_toast(t("settings.fam_org_2fa_reminder_failed"), "error"); }
              finally { set_reminding(false); }
            }}
          >
            {reminding ? t("settings.fam_org_2fa_sending") : reminder_sent ? t("settings.fam_org_2fa_reminder_sent") : t("settings.fam_org_2fa_send_reminder")}
          </button>
          <button
            onClick={dismiss_banner}
            className="p-0.5 text-white hover:opacity-70 flex-shrink-0"
            title={t("settings.fam_org_2fa_dismiss")}
            aria-label={t("settings.fam_org_2fa_dismiss")}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="divide-y divide-edge-secondary">
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_require_2fa")}
              <InfoPopover title={t("settings.fam_org_sec_require_2fa_info_title")} description={t("settings.fam_org_sec_require_2fa_info_desc")} />
              {policy.require_2fa && <span className="aster_badge aster_badge_green text-[10px]">{t("settings.fam_org_sec_active")}</span>}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">{t("settings.fam_org_sec_require_2fa_desc")}</p>
          </div>
          <Switch
            checked={policy.require_2fa}
            onCheckedChange={val => patch_draft({ require_2fa: val })}
          />
        </div>
        {policy.require_2fa && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.fam_org_sec_grace")}
                <InfoPopover title={t("settings.fam_org_sec_grace_info_title")} description={t("settings.fam_org_sec_grace_info_desc")} />
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">{t("settings.fam_org_sec_grace_desc")}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Input type="number" min="0" max="30" value={policy.require_2fa_grace_days}
                onChange={e => patch_draft({ require_2fa_grace_days: parseInt(e.target.value) || 0 })}
                className="w-16" />
              <span className="text-xs text-txt-muted">{t("settings.fam_org_sec_days")}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_max_sessions")}
              <InfoPopover title={t("settings.fam_org_sec_max_sessions_info_title")} description={t("settings.fam_org_sec_max_sessions_info_desc")} />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">{t("settings.fam_org_sec_max_sessions_desc")}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input type="number" min="1" className="w-16" placeholder={t("settings.fam_org_sec_no_limit")}
              value={policy.max_sessions_per_member ?? ""}
              onChange={e => patch_draft({ max_sessions_per_member: e.target.value ? parseInt(e.target.value) : null })} />
            <span className="text-xs text-txt-muted">{t("settings.fam_org_sec_sessions")}</span>
          </div>
        </div>
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_auto_signout")}
              <InfoPopover title={t("settings.fam_org_sec_auto_signout_info_title")} description={t("settings.fam_org_sec_auto_signout_info_desc")} />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">{t("settings.fam_org_sec_auto_signout_desc")}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input type="number" min="1" className="w-16" placeholder={t("settings.fam_org_sec_never")}
              value={policy.session_timeout_hours ?? ""}
              onChange={e => patch_draft({ session_timeout_hours: e.target.value ? parseInt(e.target.value) : null })} />
            <span className="text-xs text-txt-muted">{t("settings.fam_org_sec_hours")}</span>
          </div>
        </div>
      </div>
      {(has_changes || saving) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          {saving
            ? <p className="flex items-center gap-1.5 text-xs text-txt-muted"><Spinner size="sm" /> {t("settings.fam_org_sec_saving")}</p>
            : <p className="text-xs text-txt-muted">{t("settings.fam_org_sec_unsaved")}</p>
          }
          <div className="flex gap-2">
            <button className="aster_btn aster_btn_ghost aster_btn_sm" onClick={() => set_draft(committed)} disabled={saving}>{t("settings.fam_org_sec_discard")}</button>
            <button className="aster_btn aster_btn_primary aster_btn_sm" onClick={needs_consent ? () => set_consent_open(true) : () => set_confirm_open(true)} disabled={saving}>
              {needs_consent ? t("settings.fam_ret_request_consent") : t("settings.fam_org_sec_apply")}
            </button>
          </div>
        </div>
      )}
      {confirm_open && draft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => set_confirm_open(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-xl border border-edge-primary bg-modal-bg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-txt-primary mb-2">{t("settings.fam_org_sec_confirm_title")}</h3>
            <p className="text-sm text-txt-secondary mb-4">{t("settings.fam_org_sec_confirm_desc")}</p>
            <div className="space-y-1.5 mb-5 text-xs text-txt-muted">
              {committed && draft.require_2fa !== committed.require_2fa && (
                <p>- {t("settings.fam_org_sec_require_2fa")}: <span className="font-medium text-txt-primary">{draft.require_2fa ? t("settings.fam_org_sec_confirm_on") : t("settings.fam_org_sec_confirm_off")}</span></p>
              )}
              {committed && draft.max_sessions_per_member !== committed.max_sessions_per_member && (
                <p>- {t("settings.fam_org_sec_max_sessions")}: <span className="font-medium text-txt-primary">{draft.max_sessions_per_member ?? t("settings.fam_org_sec_no_limit")}</span></p>
              )}
              {committed && draft.session_timeout_hours !== committed.session_timeout_hours && (
                <p>- {t("settings.fam_org_sec_auto_signout")}: <span className="font-medium text-txt-primary">{draft.session_timeout_hours ? `${draft.session_timeout_hours}h` : t("settings.fam_org_sec_never")}</span></p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="aster_btn aster_btn_ghost aster_btn_md flex-1" onClick={() => set_confirm_open(false)}>{t("settings.fam_org_sec_confirm_cancel")}</button>
              <button className="aster_btn aster_btn_primary aster_btn_md flex-1" onClick={do_save}>{t("settings.fam_org_sec_confirm_apply")}</button>
            </div>
          </div>
        </div>
      )}
      {compliance.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary">{t("settings.fam_org_sec_compliance")}</h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="divide-y divide-edge-secondary">
            {compliance.map(m => {
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-3.5">
                  <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {m.has_2fa ? <span className="aster_badge aster_badge_green">{t("settings.fam_org_sec_2fa_badge")}</span> : <span className="aster_badge aster_badge_amber">{t("settings.fam_org_sec_no_2fa_badge")}</span>}
                    {m.imap_enabled && <span className="aster_badge aster_badge_gray">{t("settings.fam_org_sec_imap_badge")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ConsentGateDialog
        open={consent_open}
        on_close={() => set_consent_open(false)}
        kind="security_policy"
        description={t("settings.fam_consent_security_desc")}
        payload={draft}
        member_count={other_member_count}
        on_sent={() => { if (draft) { set_committed(draft); set_draft(draft); } }}
      />
    </div>
  );
}

function RetentionContent({ other_member_count, initial_retention }: { other_member_count: number; initial_retention?: DataRetentionPolicy | null }) {
  const { t } = use_i18n();
  const [policy, set_policy] = useState<DataRetentionPolicy | null>(initial_retention ?? null);
  const [server_policy, set_server_policy] = useState<DataRetentionPolicy | null>(initial_retention ?? null);
  const [saving, set_saving] = useState(false);
  const [confirm_enforce, set_confirm_enforce] = useState(false);
  const [consent_open, set_consent_open] = useState(false);
  const [consent_payload, set_consent_payload] = useState<DataRetentionPolicy | null>(null);
  const save_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initial_retention) return;
    get_data_retention()
      .then(r => { if (r.data) { set_policy(r.data); set_server_policy(r.data); } })
      .catch(() => { show_toast(t("settings.fam_org_ret_load_failed"), "error"); set_policy({ trash_retention_days: null, spam_retention_days: 30, sent_retention_days: null, all_mail_retention_days: null, enforce_on_members: false }); });
  }, []);

  const persist = useCallback(async (next: DataRetentionPolicy) => {
    set_saving(true);
    try {
      const r = await update_data_retention(next);
      if (r.data) { set_policy(r.data); set_server_policy(r.data); }
      else { show_toast(t("settings.fam_org_ret_save_failed"), "error"); }
    } catch { show_toast(t("settings.fam_org_ret_save_failed"), "error"); }
    finally { set_saving(false); }
  }, [t]);

  const apply = useCallback((next: DataRetentionPolicy, debounce = false) => {
    set_policy(next);
    if (other_member_count > 0 && next.enforce_on_members) {
      return;
    }
    if (save_timer.current) clearTimeout(save_timer.current);
    if (debounce) {
      save_timer.current = setTimeout(() => persist(next), 600);
    } else {
      persist(next);
    }
  }, [persist, other_member_count]);

  useEffect(() => () => { if (save_timer.current) clearTimeout(save_timer.current); }, []);

  if (!policy) return (
    <div className="flex justify-center items-center gap-2 py-8">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">{t("settings.fam_org_ret_loading")}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-surf-secondary px-3 py-2.5 border border-edge-secondary">
        <InformationCircleIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-txt-muted">{t("settings.fam_org_ret_intro")}</p>
      </div>
      <div className="divide-y divide-edge-secondary">
        {([
          { key: "trash_retention_days" as const, label: t("settings.fam_org_ret_trash"), hint: t("settings.fam_org_ret_trash_hint"), info: t("settings.fam_org_ret_trash_info") },
          { key: "spam_retention_days" as const, label: t("settings.fam_org_ret_spam"), hint: t("settings.fam_org_ret_spam_hint"), info: t("settings.fam_org_ret_spam_info") },
          { key: "sent_retention_days" as const, label: t("settings.fam_org_ret_sent"), hint: t("settings.fam_org_ret_sent_hint"), info: t("settings.fam_org_ret_sent_info") },
          { key: "all_mail_retention_days" as const, label: t("settings.fam_org_ret_all_mail"), hint: t("settings.fam_org_ret_all_mail_hint"), info: t("settings.fam_org_ret_all_mail_info") },
        ]).map(({ key, label, hint, info }) => {
          return (
            <div key={key} className="flex items-center justify-between py-4">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                  {label}
                  <InfoPopover title={label} description={info} />
                </p>
                <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Input type="number" min="1"
                  value={(policy[key] as number | null) ?? ""}
                  onChange={e => set_policy({ ...policy, [key]: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={e => apply({ ...policy, [key]: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-20" placeholder={t("settings.fam_org_ret_off")} />
                <span className="text-xs text-txt-muted">{t("settings.fam_org_ret_days")}</span>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_ret_enforce")}
              <InfoPopover title={t("settings.fam_org_ret_enforce_info_title")} description={t("settings.fam_org_ret_enforce_info_desc")} />
            </p>
            <p className={policy.enforce_on_members ? "text-sm mt-0.5 text-amber-500 dark:text-amber-400 font-medium" : "text-sm mt-0.5 text-txt-muted"}>
              {policy.enforce_on_members ? t("settings.fam_org_ret_enforce_on_desc") : t("settings.fam_org_ret_enforce_off_desc")}
            </p>
          </div>
          <Switch
            checked={policy.enforce_on_members}
            onCheckedChange={val => {
              if (val) {
                if (other_member_count > 0) {
                  set_consent_payload({ ...policy, enforce_on_members: true });
                  set_consent_open(true);
                } else {
                  set_confirm_enforce(true);
                }
              } else {
                apply({ ...policy, enforce_on_members: false });
              }
            }}
          />
        </div>
      </div>
      {(() => {
        const has_enforce_draft = other_member_count > 0 && !!policy.enforce_on_members && server_policy !== null && JSON.stringify(policy) !== JSON.stringify(server_policy);
        return has_enforce_draft ? (
          <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-3 py-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1 mr-3">{t("settings.fam_ret_unsaved_consent")}</p>
            <div className="flex gap-2 flex-shrink-0">
              <button className="aster_btn aster_btn_ghost aster_btn_sm" onClick={() => set_policy(server_policy!)}>
                {t("settings.fam_org_sec_discard")}
              </button>
              <Button size="sm" variant="depth" onClick={() => { set_consent_payload(policy); set_consent_open(true); }}>
                {t("settings.fam_ret_request_consent")}
              </Button>
            </div>
          </div>
        ) : null;
      })()}
      {saving && (
        <p className="flex items-center gap-1.5 text-xs text-txt-muted">
          <Spinner size="sm" /> {t("settings.fam_org_ret_saving")}
        </p>
      )}

      <AlertDialog open={confirm_enforce} onOpenChange={open => !open && set_confirm_enforce(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.fam_org_ret_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.fam_org_ret_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.fam_org_ret_confirm_cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { set_confirm_enforce(false); apply({ ...policy, enforce_on_members: true }); }}>
              {t("settings.fam_org_ret_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConsentGateDialog
        open={consent_open}
        on_close={() => { set_consent_open(false); set_consent_payload(null); }}
        kind="retention_policy"
        description={t("settings.fam_consent_retention_desc")}
        payload={consent_payload}
        member_count={other_member_count}
        on_sent={() => {
          set_server_policy(policy);
          set_consent_payload(null);
        }}
      />
    </div>
  );
}

export function FamilySection({ is_family_plan }: FamilySectionProps) {
  const { t } = use_i18n();
  const [group, set_group] = useState<FamilyGroupResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [tab, set_tab] = useState<FamilyTab>("overview");
  const [preloaded_filters, set_preloaded_filters] = useState<OrgFilter[] | null>(null);
  const [preloaded_security, set_preloaded_security] = useState<SecurityPolicy | null>(null);
  const [preloaded_retention, set_preloaded_retention] = useState<DataRetentionPolicy | null>(null);
  const [preloaded_compliance, set_preloaded_compliance] = useState<MemberComplianceInfo[] | null>(null);
  const [invite_email, set_invite_email] = useState("");
  const [invite_storage_gb, set_invite_storage_gb] = useState("500");
  const [invite_loading, set_invite_loading] = useState(false);
  const [show_invite_form, set_show_invite_form] = useState(false);
  const [remove_target, set_remove_target] = useState<FamilyMemberInfo | null>(null);
  const [transfer_target, set_transfer_target] = useState<FamilyMemberInfo | null>(null);
  const [show_leave_dialog, set_show_leave_dialog] = useState(false);
  const [action_loading, set_action_loading] = useState(false);
  const [changing_plan, set_changing_plan] = useState(false);
  const [compliance_map, set_compliance_map] = useState<Record<string, MemberComplianceInfo>>({});
  const [compliance_loaded, set_compliance_loaded] = useState(false);
  const [wizard_open, set_wizard_open] = useState(false);
  const [wizard_step, set_wizard_step] = useState(1);
  const [wizard_invite_email, set_wizard_invite_email] = useState("");
  const [wizard_invite_gb, set_wizard_invite_gb] = useState("500");
  const [wizard_invite_loading, set_wizard_invite_loading] = useState(false);
  const [wizard_sent_email, set_wizard_sent_email] = useState("");
  const [wizard_captcha, set_wizard_captcha] = useState<string | null>(null);
  const wizard_turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const [checklist_dismissed, set_checklist_dismissed] = useState(false);
  const [left, set_left] = useState(false);
  const [invite_captcha, set_invite_captcha] = useState<string | null>(null);
  const [invite_urls, set_invite_urls] = useState<Record<string, string>>({});
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const dismiss_checklist = () => {
    if (group?.id) { try { localStorage.setItem(`aster_family_checklist_dismissed_${group.id}`, "1"); } catch {} }
    set_checklist_dismissed(true);
  };

  useEffect(() => {
    if (!group?.id) return;
    try { set_checklist_dismissed(localStorage.getItem(`aster_family_checklist_dismissed_${group.id}`) === "1"); } catch {}
  }, [group?.id]);

  useEffect(() => {
    if (group?.viewer_role !== "owner" || !group?.id) return;
    set_compliance_loaded(false);
    get_member_compliance()
      .then(r => {
        if (r.data) {
          const map: Record<string, MemberComplianceInfo> = {};
          r.data.forEach(m => { map[m.user_id] = m; });
          set_compliance_map(map);
        }
      })
      .catch(() => {})
      .finally(() => set_compliance_loaded(true));
  }, [group?.id, group?.viewer_role]);

  const cache_invite_url = useCallback((group_id: string, invite_id: string, join_url: string) => {
    set_invite_urls(prev => {
      const next = { ...prev, [invite_id]: join_url };
      try { localStorage.setItem(`aster_family_invite_urls_${group_id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const load_group = useCallback(async () => {
    try {
      const res = await get_family_group();
      if (res.data) {
        set_group(res.data);
        if (res.data.viewer_role === "owner") {
          void Promise.all([
            list_org_filters().then(r => { if (r.data) set_preloaded_filters(r.data); }).catch(() => {}),
            get_security_policy().then(r => { if (r.data) set_preloaded_security(r.data); }).catch(() => {}),
            get_data_retention().then(r => { if (r.data) set_preloaded_retention(r.data); }).catch(() => {}),
            get_member_compliance().then(r => { if (r.data) set_preloaded_compliance(r.data); }).catch(() => {}),
          ]);
        }
        const active = res.data.members.filter(m => m.status === "active").length;
        const remaining_seats = Math.max(1, res.data.max_members - active);
        const used_alloc =
          res.data.members.filter(m => m.status === "active").reduce((s, m) => s + m.allocated_storage_bytes, 0) +
          res.data.pending_invites.reduce((s, i) => s + (i.allocated_storage_bytes || 0), 0);
        const remaining_bytes = Math.max(0, res.data.storage_pool_bytes - used_alloc);
        const default_gb = String(Math.max(1, Math.round(remaining_bytes / remaining_seats / 1073741824)));
        set_invite_storage_gb(default_gb);
        set_wizard_invite_gb(default_gb);
        const live_ids = new Set(res.data.pending_invites.map(i => i.id));
        try {
          const raw = localStorage.getItem(`aster_family_invite_urls_${res.data.id}`);
          const stored: Record<string, string> = raw ? JSON.parse(raw) : {};
          const pruned = Object.fromEntries(Object.entries(stored).filter(([id]) => live_ids.has(id)));
          localStorage.setItem(`aster_family_invite_urls_${res.data.id}`, JSON.stringify(pruned));
          set_invite_urls(pruned);
        } catch {}
        if (
          res.data.viewer_role === "owner" &&
          res.data.members.filter(m => m.status === "active").length === 1 &&
          !localStorage.getItem(`aster_family_setup_${res.data.id}`)
        ) {
          set_wizard_open(true);
        }
      }
    } catch { /* not in a group */ }
    finally { set_loading(false); }
  }, []);

  useEffect(() => {
    if (is_family_plan) load_group();
    else set_loading(false);
  }, [is_family_plan, load_group]);

  useEffect(() => {
    const on_visible = () => { if (!document.hidden && is_family_plan) load_group(); };
    document.addEventListener("visibilitychange", on_visible);
    return () => document.removeEventListener("visibilitychange", on_visible);
  }, [is_family_plan, load_group]);

  const is_owner = group?.viewer_role === "owner";
  const has_pending_link = group?.pending_invites.some(i => i.link_only) ?? false;


  const handle_upgrade_to_family = async () => {
    set_changing_plan(true);
    try {
      // Single attempt only - never blind-retry a billing mutation with a
      // different interval (could create a second plan change if the first
      // succeeded server-side but returned a transient error).
      const res = await change_plan("family", "year");
      if (res.ok) { show_toast(t("settings.fam_org_plan_upgraded"), "success"); window.location.reload(); }
      else { show_toast(t("settings.failed_save_setting"), "error"); }
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_changing_plan(false); }
  };


  const handle_wizard_invite = async () => {
    const email = wizard_invite_email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show_toast(t("settings.fam_org_invalid_email"), "error"); return;
    }
    const storage = Math.round(parseFloat(wizard_invite_gb) * 1073741824);
    if (!wizard_invite_gb || isNaN(storage) || storage < 1) return;
    if (turnstile_required && !wizard_captcha) { show_toast(t("settings.fam_org_captcha_required"), "error"); return; }
    set_wizard_invite_loading(true);
    try {
      const res = await invite_member(email, storage, wizard_captcha ?? undefined);
      if (res.error) { show_toast(res.error && res.error.toLowerCase().includes("pending invite") ? t("settings.fam_org_invite_exists") : t("settings.fam_org_action_failed"), "error"); return; }
      set_wizard_sent_email(email);
      set_wizard_step(3);
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_wizard_invite_loading(false); set_wizard_captcha(null); wizard_turnstile_ref.current?.reset(); }
  };

  const close_wizard = () => {
    if (group) localStorage.setItem(`aster_family_setup_${group.id}`, "1");
    set_wizard_open(false);
    set_wizard_step(1);
    set_wizard_invite_email("");
    set_wizard_sent_email("");
  };

  const handle_invite_email = async () => {
    const email = invite_email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show_toast(t("settings.fam_org_invalid_email"), "error"); return;
    }
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);
    if (!invite_storage_gb || isNaN(storage) || storage < 1) return;
    if (turnstile_required && !invite_captcha) { show_toast(t("settings.fam_org_captcha_required"), "error"); return; }
    set_invite_loading(true);
    try {
      const res = await invite_member(email, storage, invite_captcha ?? undefined);
      if (res.error) { show_toast(res.error && res.error.toLowerCase().includes("pending invite") ? t("settings.fam_org_invite_exists") : t("settings.fam_org_action_failed"), "error"); return; }
      if (res.data && group) cache_invite_url(group.id, res.data.invite_id, res.data.join_url);
      show_toast(t("settings.family_invite_sent"), "success");
      set_invite_email(""); set_show_invite_form(false);
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_invite_loading(false); set_invite_captcha(null); turnstile_ref.current?.reset(); }
  };

  const handle_copy_link = async () => {
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);
    if (!invite_storage_gb || isNaN(storage) || storage < 1) return;
    if (turnstile_required && !invite_captcha) { show_toast(t("settings.fam_org_captcha_required"), "error"); return; }
    set_invite_loading(true);
    try {
      const res = await create_invite_link(storage, invite_captcha ?? undefined);
      if (!res.data) throw new Error();
      if (group) cache_invite_url(group.id, res.data.invite_id, res.data.join_url);
      await navigator.clipboard.writeText(res.data.join_url);
      show_toast(t("settings.family_invite_link_copied"), "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_invite_loading(false); set_invite_captcha(null); turnstile_ref.current?.reset(); }
  };

  const handle_revoke_invite = async (invite_id: string) => {
    try {
      const r = await revoke_invite(invite_id);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      show_toast(t("settings.fam_org_invite_revoked_toast"), "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
  };

  const handle_remove_confirm = async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      const r = await remove_family_member(remove_target.user_id);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      show_toast(t("settings.fam_org_member_removed_toast"), "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_remove_target(null); }
  };

  const handle_transfer_confirm = async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      const r = await transfer_family_admin(transfer_target.user_id);
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      show_toast(t("settings.fam_org_admin_transferred_toast"), "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_transfer_target(null); }
  };

  const handle_leave_confirm = async () => {
    set_action_loading(true);
    try {
      const r = await leave_family();
      if (r.error) { show_toast(t("settings.fam_org_action_failed"), "error"); return; }
      show_toast(t("settings.family_leave"), "success");
      set_left(true);
      set_group(null);
      window.dispatchEvent(new CustomEvent("aster:plan-changed"));
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_show_leave_dialog(false); }
  };

  if (!is_family_plan || loading) return null;

  if (left) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">{t("settings.fam_org_heading")}</h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircleIcon className="w-10 h-10 text-green-500" />
          <p className="text-sm font-medium text-txt-primary">{t("settings.fam_org_left_title")}</p>
          <p className="text-xs text-txt-muted max-w-xs">{t("settings.fam_org_left_desc")}</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">{t("settings.fam_org_heading")}</h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        <div className="flex justify-center items-center gap-2 py-8">
          <Spinner size="sm" />
          <span className="text-sm text-txt-muted">{t("settings.fam_org_setting_up")}</span>
        </div>
        <button onClick={() => window.location.reload()} className="aster_btn aster_btn_secondary aster_btn_sm">{t("settings.fam_org_refresh")}</button>
      </div>
    );
  }

  // Only "active" members occupy a seat and appear in the roster. Members in
  // "grace" have been removed (30-day wind-down on their own account) and must
  // not show as current family members or count toward seats - this keeps the
  // roster and seat math in sync with the backend (which counts status='active').
  const active_members = group.members.filter(m => m.status === "active");
  const pool_used = group.members.reduce((s, m) => s + m.storage_used_bytes, 0);
  const pool_pct = storage_pct(pool_used, group.storage_pool_bytes);
  const seats_remaining = group.max_members - active_members.length;
  const seats_full = active_members.length >= group.max_members;

  type OwnTab = { id: FamilyTab; label: string; Icon: React.ElementType };
  const owner_tabs: OwnTab[] = is_owner ? [
    { id: "overview", label: t("settings.fam_org_tab_overview"), Icon: Squares2X2Icon },
    { id: "members", label: t("settings.fam_org_tab_members"), Icon: UserPlusIcon },
    { id: "kids", label: t("settings.fam_kids_tab"), Icon: UserIcon },
    { id: "groups", label: t("settings.fam_org_tab_groups"), Icon: UserGroupIcon },
    { id: "activity", label: t("settings.fam_org_tab_activity"), Icon: ChartBarIcon },
    { id: "filters", label: t("settings.fam_org_tab_filters"), Icon: FunnelIcon },
    { id: "domains", label: t("settings.fam_org_tab_domains"), Icon: GlobeAltIcon },
    { id: "security", label: t("settings.fam_org_tab_security"), Icon: ShieldCheckIcon },
    { id: "retention", label: t("settings.fam_org_tab_retention"), Icon: ArchiveBoxIcon },
  ] : [];

  return (
    <div className="space-y-4 w-full min-w-0">
      {group.status !== "active" && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: group.status === "grace" ? "#f59e0b" : "#ef4444", border: "none" }}
        >
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-white" />
          <p className="text-sm font-medium flex-1 min-w-0 text-white">
            {group.status === "grace"
              ? (group.grace_period_end
                ? t("settings.fam_org_grace_banner", { date: new Date(group.grace_period_end).toLocaleDateString() })
                : t("settings.fam_org_grace_banner_soon"))
              : t("settings.fam_org_cancelled_banner")}
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "billing" }))}
            className="text-xs font-semibold hover:underline flex-shrink-0 text-white"
          >
            {t("settings.fam_org_manage_billing")}
          </button>
        </div>
      )}
      <div>
        <h2 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          {t("settings.fam_org_heading")}
          <span className="aster_badge aster_badge_blue">{group.plan_name}</span>
          {group.status === "active"
            ? <span className="aster_badge aster_badge_green">{t("settings.fam_org_status_active")}</span>
            : group.status === "grace"
            ? <span className="aster_badge aster_badge_amber">{t("settings.fam_org_status_expiring")}</span>
            : <span className="aster_badge aster_badge_red">{t("settings.fam_org_status_cancelled")}</span>}
        </h2>
        <p className="text-sm text-txt-secondary mt-0.5">
          {seats_remaining !== 1
            ? t("settings.fam_org_members_count_plural", { active: active_members.length, max: group.max_members, seats: seats_remaining })
            : t("settings.fam_org_members_count", { active: active_members.length, max: group.max_members, seats: seats_remaining })}
        </p>
      </div>

      {is_owner && (
        <div className="inline-flex p-1 rounded-lg bg-surf-secondary overflow-x-auto scrollbar-none max-w-full">
          {owner_tabs.map(t_item => (
            <button
              key={t_item.id}
              onClick={() => set_tab(t_item.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none whitespace-nowrap ${tab === t_item.id ? "bg-surf-primary" : "bg-transparent"}`}
              style={{ color: tab === t_item.id ? "var(--text-primary)" : "var(--text-muted)", boxShadow: tab === t_item.id ? "rgba(0,0,0,0.1) 0px 1px 3px,rgba(0,0,0,0.06) 0px 1px 2px" : "none" }}
            >
              <t_item.Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {t_item.label}
            </button>
          ))}
        </div>
      )}

      {!is_owner && (
        <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
          {(["overview", "groups"] as const).map(tid => (
            <button
              key={tid}
              onClick={() => set_tab(tid)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 whitespace-nowrap ${tab === tid ? "bg-surf-primary" : "bg-transparent"}`}
              style={{ color: tab === tid ? "var(--text-primary)" : "var(--text-muted)", boxShadow: tab === tid ? "rgba(0,0,0,0.1) 0px 1px 3px,rgba(0,0,0,0.06) 0px 1px 2px" : "none" }}
            >
              {tid === "overview" ? t("settings.fam_org_tab_overview") : t("settings.fam_org_tab_groups")}
            </button>
          ))}
        </div>
      )}

      {!is_owner && tab === "groups" && <MemberGroupsContent />}

      {(tab === "overview" || !is_owner) && tab !== "groups" && (
        <>
          {!is_owner && <MemberConsentPanel />}
          {is_owner && (() => {
            const has_members = active_members.length > 1 || group.pending_invites.length > 0;
            const comp_values = Object.values(compliance_map);
            const security_done = comp_values.length > 0 && comp_values.every(m => m.has_2fa);
            const checklist: { label: string; done: boolean; tab_target: FamilyTab | null }[] = [
              { label: t("settings.fam_org_checklist_subscribe"), done: true, tab_target: null },
              { label: t("settings.fam_org_checklist_invite"), done: has_members, tab_target: "members" },
              { label: t("settings.fam_org_checklist_security"), done: security_done, tab_target: "security" },
            ];
            const completed = checklist.filter(c => c.done).length;
            if (completed === checklist.length || checklist_dismissed) return null;
            return (
              <div className="rounded-xl border border-edge-secondary bg-surf-secondary p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-txt-primary">{t("settings.fam_org_checklist_title")}</p>
                  <button
                    onClick={dismiss_checklist}
                    className="p-0.5 -mr-1 text-txt-muted hover:text-txt-secondary flex-shrink-0"
                    title={t("settings.fam_org_2fa_dismiss")}
                    aria-label={t("settings.fam_org_2fa_dismiss")}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-full h-1.5 bg-edge-secondary rounded-full mb-3">
                  <div
                    className="h-full bg-accent-blue rounded-full transition-all"
                    style={{ width: `${(completed / checklist.length) * 100}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {checklist.map(item => (
                    <div
                      key={item.label}
                      role={!item.done && item.tab_target ? "button" : undefined}
                      tabIndex={!item.done && item.tab_target ? 0 : undefined}
                      onClick={!item.done && item.tab_target ? () => set_tab(item.tab_target!) : undefined}
                      onKeyDown={!item.done && item.tab_target ? (e) => { if (e.key === "Enter" || e.key === " ") set_tab(item.tab_target!); } : undefined}
                      className={`flex items-center gap-2 ${!item.done && item.tab_target ? "cursor-pointer hover:bg-surf-primary rounded-lg px-1 -mx-1 transition-colors" : ""}`}
                    >
                      {item.done ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-edge-secondary flex-shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${item.done ? "text-txt-muted line-through" : "text-txt-primary"}`}>
                        {item.label}
                      </span>
                      {!item.done && item.tab_target && (
                        <ChevronRightIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-3 divide-x divide-edge-secondary rounded-xl border border-edge-secondary">
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <UserGroupIcon className="w-3.5 h-3.5 text-txt-muted" />
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">{t("settings.fam_org_stat_members")}</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary tabular-nums">
                {active_members.length}
                <span className="text-base font-normal text-txt-muted"> / {group.max_members}</span>
              </p>
              <p className="text-xs text-txt-muted mt-1">
                {seats_remaining !== 1
                  ? t("settings.fam_org_stat_seats_available_plural", { count: seats_remaining })
                  : t("settings.fam_org_stat_seats_available", { count: seats_remaining })}
                {group.pending_invites.length > 0 && <span className="text-amber-500"> · {t("settings.fam_org_stat_pending", { count: group.pending_invites.length })}</span>}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CircleStackIcon className="w-3.5 h-3.5 text-txt-muted" />
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">{t("settings.fam_org_stat_storage_used")}</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary tabular-nums">
                {format_bytes(pool_used)}
              </p>
              <p className="text-xs text-txt-muted mt-1">{t("settings.fam_org_stat_of_total", { total: format_bytes(group.storage_pool_bytes) })}</p>
              <div className="w-full bg-edge-secondary rounded-full h-1.5 mt-2">
                <div
                  className={`h-1.5 rounded-full transition-all ${pool_pct >= 90 ? "bg-red-500" : pool_pct >= 70 ? "bg-amber-500" : "bg-accent-blue"}`}
                  style={{ width: `${Math.max(pool_pct, 0.3)}%` }}
                />
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-txt-muted" />
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">{t("settings.fam_org_stat_encryption")}</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary mt-1.5">{t("settings.fam_org_stat_e2e")}</p>
              <p className="text-xs text-txt-muted mt-1">{t("settings.fam_org_stat_zero_access")}</p>
            </div>
          </div>

          <div className="space-y-1.5 py-1">
            {active_members.slice(0, 4).map(m => (
              <div key={m.user_id} className="flex items-center gap-2.5">
                <ProfileAvatar email={`${m.username}@${m.email_domain}`} name={m.username} size="xs" />
                <span className="text-sm text-txt-primary truncate min-w-0 flex-1">{m.username}@{m.email_domain}</span>
                {m.role === "owner"
                  ? <span className="aster_badge aster_badge_blue flex-shrink-0">{t("settings.fam_org_preview_owner")}</span>
                  : m.status === "grace"
                  ? <span className="aster_badge aster_badge_amber flex-shrink-0">{t("settings.family_member_grace")}</span>
                  : <span className="aster_badge aster_badge_gray flex-shrink-0">{t("settings.family_member_member")}</span>
                }
              </div>
            ))}
            {active_members.length > 4 && (
              <p className="text-xs text-txt-muted pl-9">{t("settings.fam_org_preview_more", { count: active_members.length - 4 })}</p>
            )}
            {is_owner && (
              <button onClick={() => set_tab("members")} className="mt-1 aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5">
                <UserPlusIcon className="w-3.5 h-3.5" /> {t("settings.fam_org_preview_manage")}
              </button>
            )}
          </div>

          {is_owner && (
            <button
              onClick={() => set_tab("security")}
              className="w-full text-left rounded-xl border border-edge-secondary px-4 py-3 hover:bg-surf-secondary transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                  <span className="text-sm font-medium text-txt-primary">{t("settings.fam_org_summary_security")}</span>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-txt-muted group-hover:text-txt-secondary transition-colors" />
              </div>
              {(() => {
                const comp_members = Object.values(compliance_map);
                if (!compliance_loaded) {
                  return (
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-txt-muted"><Spinner size="sm" /> {t("settings.fam_org_summary_checking")}</span>
                    </div>
                  );
                }
                if (comp_members.length === 0) return null;
                const compliant = comp_members.filter(m => m.has_2fa).length;
                const total = comp_members.length;
                const all_ok = compliant === total;
                return (
                  <div className="flex items-center justify-between mt-2.5">
                    <span className={all_ok ? "aster_badge aster_badge_green" : "aster_badge aster_badge_amber"}>
                      {all_ok ? t("settings.fam_org_summary_all_2fa") : t("settings.fam_org_summary_partial_2fa", { compliant, total })}
                    </span>
                  </div>
                );
              })()}
            </button>
          )}

          {is_owner && seats_full && group.plan_name === "Duo" && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-edge-secondary">
              <InformationCircleIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
              <p className="text-sm text-txt-secondary flex-1">{t("settings.fam_org_seats_full_notice")}</p>
              <button onClick={handle_upgrade_to_family} disabled={changing_plan} className="aster_btn aster_btn_primary aster_btn_sm flex-shrink-0 disabled:opacity-50">{t("settings.fam_org_upgrade")}</button>
            </div>
          )}

          {is_owner && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "billing" }))}
              className="flex items-center gap-2 text-xs text-accent-blue hover:underline py-1"
            >
              <ArrowRightIcon className="w-3.5 h-3.5" />
              {t("settings.fam_org_manage_billing_plan")}
            </button>
          )}

          {!is_owner && (
            <button onClick={() => set_show_leave_dialog(true)} className="aster_btn aster_btn_destructive aster_btn_sm">
              {t("settings.family_leave")}
            </button>
          )}
        </>
      )}

      {tab === "members" && is_owner && (
        <>
          <div>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                {t("settings.family_members")}
                <InfoPopover title={t("settings.fam_org_members_info_title")} description={t("settings.fam_org_members_info_desc")} />
                <span className="ml-auto text-xs font-normal text-txt-muted">{active_members.length} / {group.max_members}</span>
              </h3>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <div className="divide-y divide-edge-secondary">
              {(() => {
                const used_alloc = active_members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
                const pool_remaining_raw = Math.max(0, group.storage_pool_bytes - used_alloc);
                return (<>
                  {active_members.filter(m => m.role === "owner").map(m => (
                    <MemberRow key={m.user_id} member={m} is_owner_view={true}
                      compliance={compliance_map[m.user_id]}
                      pool_remaining_bytes={pool_remaining_raw}
                      on_remove={set_remove_target} on_transfer={set_transfer_target} on_reload={load_group} />
                  ))}
              {active_members.filter(m => m.role !== "owner").length === 0 ? (
                !show_invite_form && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <UserGroupIcon className="w-8 h-8 text-txt-muted" />
                    <div className="text-center">
                      <p className="text-base font-semibold text-txt-primary">{t("settings.fam_org_no_members_title")}</p>
                      <p className="text-sm text-txt-muted mt-1">{t("settings.fam_org_no_members_desc")}</p>
                    </div>
                    <button onClick={() => set_show_invite_form(true)} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5">
                      <UserPlusIcon className="w-4 h-4" />
                      {t("settings.family_invite_member")}
                    </button>
                  </div>
                )
              ) : (
                  active_members.filter(m => m.role !== "owner").map(m => (
                    <MemberRow key={m.user_id} member={m} is_owner_view={true}
                      compliance={compliance_map[m.user_id]}
                      pool_remaining_bytes={pool_remaining_raw}
                      on_remove={set_remove_target} on_transfer={set_transfer_target} on_reload={load_group} />
                  ))
                )}
              </>);
              })()}
            </div>
          </div>

          {active_members.length < group.max_members && (show_invite_form || active_members.filter(m => m.role !== "owner").length > 0) && (
            <div>
              <div className="mt-1 h-px bg-edge-secondary mb-3" />
              {!show_invite_form ? (
                <button onClick={() => set_show_invite_form(true)} className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5">
                  <UserPlusIcon className="w-3.5 h-3.5" /> {t("settings.fam_org_add_member")}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-txt-muted mb-1 block">{t("settings.family_invite_email_placeholder")}</label>
                      <Input type="email" placeholder={t("settings.family_invite_email_placeholder")} value={invite_email}
                        onChange={e => set_invite_email(e.target.value)} autoFocus />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-txt-muted mb-1 block">{t("settings.family_invite_storage")}</label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min="1" value={invite_storage_gb} onChange={e => set_invite_storage_gb(e.target.value)} className="w-20" />
                        <span className="text-sm text-txt-muted">{t("settings.fam_org_gb")}</span>
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const pool = group.storage_pool_bytes;
                    // Match the backend pool check: active members' allocations
                    // PLUS outstanding pending-invite allocations.
                    const member_alloc = active_members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
                    const pending_alloc = group.pending_invites.reduce((s, i) => s + (i.allocated_storage_bytes || 0), 0);
                    const used_alloc = member_alloc + pending_alloc;
                    const invite_bytes = Math.round((parseFloat(invite_storage_gb) || 0) * 1073741824);
                    const free = Math.max(0, pool - used_alloc - invite_bytes);
                    const over = used_alloc + invite_bytes > pool;
                    return (
                      <p className={`text-xs leading-relaxed mt-1 ${over ? "text-red-500 font-medium" : "text-txt-muted"}`}>
                        {over
                          ? t("settings.fam_org_invite_summary_over", { member: format_bytes(invite_bytes), avail: format_bytes(Math.max(0, pool - used_alloc)) })
                          : t("settings.fam_org_invite_summary", { member: format_bytes(invite_bytes), free: format_bytes(free), pool: format_bytes(pool) })}
                      </p>
                    );
                  })()}
                  {turnstile_required && (
                    <TurnstileWidget
                      ref={turnstile_ref}
                      on_verify={set_invite_captcha}
                      on_expire={() => set_invite_captcha(null)}
                      class_name="flex justify-start mt-4"
                    />
                  )}
                  <div className="flex gap-2">
                    <button onClick={handle_invite_email} disabled={invite_loading || (turnstile_required && !invite_captcha)} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
                      <UserPlusIcon className="w-4 h-4" /> {t("settings.family_invite_send")}
                    </button>
                    <button onClick={handle_copy_link} disabled={invite_loading || has_pending_link || (turnstile_required && !invite_captcha)}
                      className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
                      title={has_pending_link ? t("settings.fam_org_revoke_link_first") : undefined}>
                      <LinkIcon className="w-4 h-4" /> {t("settings.family_invite_copy_link")}
                    </button>
                    <button onClick={() => set_show_invite_form(false)} className="aster_btn aster_btn_ghost aster_btn_sm">{t("settings.fam_org_invite_cancel")}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {group.pending_invites.length > 0 && (
            <div>
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wide">{t("settings.family_invite_pending")}</h3>
                <div className="mt-2 h-px bg-edge-secondary" />
              </div>
              <div className="divide-y divide-edge-secondary">
                {group.pending_invites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {inv.link_only
                        ? <LinkIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
                        : <UserPlusIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />}
                      <div>
                        <p className="text-sm text-txt-primary">{inv.link_only ? t("settings.family_invite_link") : t("settings.family_invite_by_email")}</p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.family_invite_expires", { date: new Date(inv.expires_at).toLocaleDateString() })}
                          {inv.allocated_storage_bytes > 0 && <span> · {t("settings.fam_org_invite_allocated", { count: Math.round(inv.allocated_storage_bytes / 1073741824) })}</span>}
                          {inv.created_at && <span> · {t("settings.fam_org_invite_sent_ago", { time: invite_sent_relative(inv.created_at, t) })}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {invite_urls[inv.id] && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(invite_urls[inv.id]);
                            show_toast(t("settings.family_invite_link_copied"), "success");
                          }}
                          className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          {t("settings.family_invite_copy_link")}
                        </button>
                      )}
                      <button onClick={() => handle_revoke_invite(inv.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600 flex-shrink-0">
                        {t("settings.family_invite_revoke")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "kids"      && is_owner && <KidsContent group={group} />}
      {tab === "groups"    && is_owner && <GroupsContent members={active_members} />}
      {tab === "activity"  && is_owner && <ActivityContent members={active_members} />}
      {tab === "filters"   && is_owner && <FiltersContent other_member_count={active_members.length - 1} initial_filters={preloaded_filters} />}
      {tab === "domains"   && is_owner && <DomainsContent members={active_members} />}
      {tab === "security"  && is_owner && <SecurityContent other_member_count={active_members.length - 1} initial_security={preloaded_security} initial_compliance={preloaded_compliance} />}
      {tab === "security"  && !is_owner && <MemberSecurityView />}
      {tab === "retention" && is_owner && <RetentionContent other_member_count={active_members.length - 1} initial_retention={preloaded_retention} />}


      {wizard_open && (
        <Modal is_open={wizard_open} on_close={close_wizard} size="md" close_on_overlay={false}>
          {wizard_step === 1 && (
            <>
              <ModalHeader>
                <div className="flex flex-col items-center gap-3 pt-2 pb-1">
                  <UserGroupIcon className="w-12 h-12 text-accent-blue" />
                  <ModalTitle className="text-xl font-bold text-center">{t("settings.fam_org_wizard_welcome")}</ModalTitle>
                </div>
              </ModalHeader>
              <div className="px-6 pb-4 space-y-4">
                <ModalDescription className="sr-only">{t("settings.fam_org_wizard_setup_desc")}</ModalDescription>
                <div className="text-center space-y-2">
                  <span className="aster_badge aster_badge_blue">{group.plan_name}</span>
                  <p className="text-sm text-txt-secondary">
                    {t("settings.fam_org_wizard_storage_summary", { storage: format_bytes(group.storage_pool_bytes), count: group.max_members })}
                  </p>
                </div>
                <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
                  {([
                    { Icon: UserPlusIcon, label: t("settings.fam_org_wizard_feat_members"), desc: t("settings.fam_org_wizard_feat_members_desc", { count: group.max_members }) },
                    { Icon: ShieldCheckIcon, label: t("settings.fam_org_wizard_feat_security"), desc: t("settings.fam_org_wizard_feat_security_desc") },
                    { Icon: UserGroupIcon, label: t("settings.fam_org_wizard_feat_groups"), desc: t("settings.fam_org_wizard_feat_groups_desc") },
                    { Icon: FunnelIcon, label: t("settings.fam_org_wizard_feat_filters"), desc: t("settings.fam_org_wizard_feat_filters_desc") },
                    { Icon: GlobeAltIcon, label: t("settings.fam_org_wizard_feat_domains"), desc: t("settings.fam_org_wizard_feat_domains_desc") },
                    { Icon: ArchiveBoxIcon, label: t("settings.fam_org_wizard_feat_retention"), desc: t("settings.fam_org_wizard_feat_retention_desc") },
                  ] as const).map(({ Icon, label, desc }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-3">
                      <Icon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-txt-primary">{label}</span>
                        <span className="text-xs text-txt-muted ml-2">{desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <ModalFooter>
                <Button variant="ghost" onClick={close_wizard}>{t("settings.fam_org_wizard_not_now")}</Button>
                <Button variant="depth" onClick={() => set_wizard_step(2)}>
                  {t("settings.fam_org_wizard_get_started")} <ArrowRightIcon className="w-4 h-4 ml-1" />
                </Button>
              </ModalFooter>
            </>
          )}
          {wizard_step === 2 && (() => {
            const pool_gb = group.storage_pool_bytes / 1073741824;
            const used_alloc = group.members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
            const used_gb = used_alloc / 1073741824;
            const invite_gb_num = Math.max(0, parseFloat(wizard_invite_gb) || 0);
            const remaining_gb = Math.max(0, pool_gb - used_gb - invite_gb_num);
            const low_remaining = remaining_gb / pool_gb < 0.1;
            return (
              <>
                <ModalHeader>
                  <ModalTitle>{t("settings.fam_org_wizard_invite_title")}</ModalTitle>
                  <ModalDescription>{t("settings.fam_org_wizard_invite_desc")}</ModalDescription>
                </ModalHeader>
                <div className="px-6 pb-4 space-y-4">
                  <Input
                    type="email"
                    placeholder={t("settings.fam_org_wizard_member_placeholder")}
                    value={wizard_invite_email}
                    onChange={e => set_wizard_invite_email(e.target.value)}
                    autoFocus
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-txt-muted">{t("settings.fam_org_wizard_storage_label")}</label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="1"
                          max={String(Math.max(1, Math.floor(pool_gb - used_gb)))}
                          value={wizard_invite_gb}
                          onChange={e => set_wizard_invite_gb(e.target.value)}
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-xs text-txt-muted">{t("settings.fam_org_gb")}</span>
                      </div>
                    </div>
                    <p className={`text-xs mt-0.5 ${low_remaining ? "text-amber-500" : "text-txt-muted"}`}>
                      {t("settings.fam_org_wizard_pool_remaining", { count: remaining_gb.toFixed(1) })}
                    </p>
                  </div>
                  {turnstile_required && (
                    <TurnstileWidget
                      ref={wizard_turnstile_ref}
                      on_verify={set_wizard_captcha}
                      on_expire={() => set_wizard_captcha(null)}
                    />
                  )}
                </div>
                <ModalFooter>
                  <Button variant="ghost" onClick={() => set_wizard_step(1)}>{t("settings.fam_org_wizard_back")}</Button>
                  <Button variant="outline" onClick={() => set_wizard_step(3)}>{t("settings.fam_org_wizard_skip")}</Button>
                  <Button
                    variant="depth"
                    onClick={handle_wizard_invite}
                    disabled={!wizard_invite_email.trim() || wizard_invite_loading || (turnstile_required && !wizard_captcha)}
                  >
                    {wizard_invite_loading ? <Spinner size="sm" /> : t("settings.fam_org_wizard_send_invite")}
                  </Button>
                </ModalFooter>
              </>
            );
          })()}
          {wizard_step === 3 && (
            <>
              <ModalHeader>
                <ModalTitle>{wizard_sent_email ? t("settings.fam_org_wizard_done_title_sent") : t("settings.fam_org_wizard_done_title")}</ModalTitle>
                <ModalDescription>
                  {wizard_sent_email
                    ? t("settings.fam_org_wizard_done_desc_sent", { email: wizard_sent_email })
                    : t("settings.fam_org_wizard_done_desc")}
                </ModalDescription>
              </ModalHeader>
              <div className="px-6 pb-4 space-y-3">
                {wizard_sent_email && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "#22c55e", border: "none" }}>
                    <CheckCircleIcon className="w-4 h-4 text-white flex-shrink-0" />
                    <p className="text-sm font-medium text-white">
                      {t("settings.fam_org_wizard_invite_sent_to", { email: wizard_sent_email })}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { Icon: ShieldCheckIcon, tab: "security" as FamilyTab, label: t("settings.fam_org_wizard_grid_security"), desc: t("settings.fam_org_wizard_grid_security_desc") },
                    { Icon: UserGroupIcon, tab: "groups" as FamilyTab, label: t("settings.fam_org_wizard_grid_groups"), desc: t("settings.fam_org_wizard_grid_groups_desc") },
                    { Icon: FunnelIcon, tab: "filters" as FamilyTab, label: t("settings.fam_org_wizard_grid_filters"), desc: t("settings.fam_org_wizard_grid_filters_desc") },
                    { Icon: GlobeAltIcon, tab: "domains" as FamilyTab, label: t("settings.fam_org_wizard_grid_domains"), desc: t("settings.fam_org_wizard_grid_domains_desc") },
                    { Icon: ArchiveBoxIcon, tab: "retention" as FamilyTab, label: t("settings.fam_org_wizard_grid_retention"), desc: t("settings.fam_org_wizard_grid_retention_desc") },
                    { Icon: ChartBarIcon, tab: "activity" as FamilyTab, label: t("settings.fam_org_wizard_grid_activity"), desc: t("settings.fam_org_wizard_grid_activity_desc") },
                  ]).map(({ Icon, tab: target_tab, label, desc }) => (
                    <button
                      key={label}
                      onClick={() => { close_wizard(); set_tab(target_tab); }}
                      className="flex flex-col gap-1.5 p-3 rounded-xl border border-edge-secondary bg-surf-primary hover:bg-surf-secondary text-left transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                        <span className="text-sm font-semibold text-txt-primary">{label}</span>
                        <ArrowRightIcon className="w-3 h-3 text-txt-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs text-txt-muted leading-relaxed">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <ModalFooter>
                <Button variant="ghost" onClick={() => set_wizard_step(2)}>{t("settings.fam_org_wizard_back")}</Button>
                <Button variant="depth" onClick={close_wizard}>{t("settings.fam_org_wizard_done")}</Button>
              </ModalFooter>
            </>
          )}
        </Modal>
      )}

      <AlertDialog open={!!remove_target} onOpenChange={open => !open && set_remove_target(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.family_remove_confirm_title", { name: remove_target?.username ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.family_remove_confirm_body", { name: remove_target?.username ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction onClick={handle_remove_confirm} disabled={action_loading} className="aster_btn_destructive">
              {action_loading ? <Spinner size="sm" /> : t("settings.family_remove_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!transfer_target} onOpenChange={open => !open && set_transfer_target(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.family_transfer_confirm_title", { name: transfer_target?.username ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.family_transfer_confirm_body", { name: transfer_target?.username ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction onClick={handle_transfer_confirm} disabled={action_loading}>
              {action_loading ? <Spinner size="sm" /> : t("settings.family_transfer_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={show_leave_dialog} onOpenChange={set_show_leave_dialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.family_leave_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.family_leave_confirm_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.keep_plan")}</AlertDialogCancel>
            <AlertDialogAction onClick={handle_leave_confirm} disabled={action_loading} className="aster_btn_destructive">
              {action_loading ? <Spinner size="sm" /> : t("settings.family_leave_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
