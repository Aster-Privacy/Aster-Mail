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
  ChevronDownIcon,
  PlusIcon,
  InformationCircleIcon,
  GlobeAltIcon,
  FunnelIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch, Button } from "@aster/ui";
import { get_avatar_color } from "@/lib/avatar_color";
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
  type OrgGroup, type OrgGroupMember, type OrgFilter, type FamilyDomain,
  type ActivityLogEntry, type DataRetentionPolicy, type SecurityPolicy,
  type MemberComplianceInfo,
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
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
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

type FamilyTab = "overview" | "members" | "groups" | "activity" | "filters" | "domains" | "security" | "retention";

const EVENT_LABELS: Record<string, string> = {
  member_joined: "Member joined", member_removed: "Member removed",
  member_left: "Member left", admin_transferred: "Admin transferred",
  group_created: "Group created", group_deleted: "Group deleted",
  filter_created: "Filter created", domain_shared: "Domain shared",
  retention_updated: "Retention updated", security_policy_updated: "Security updated",
  invite_sent: "Invite sent", invite_revoked: "Invite revoked",
  storage_updated: "Storage updated", security_notify_sent: "2FA reminder sent",
};

interface FamilySectionProps {
  is_family_plan: boolean;
}

function storage_pct(used: number, total: number) {
  return total > 0 ? Math.min(100, (used / total) * 100) : 0;
}

function last_seen_relative(iso: string | null | undefined): string {
  if (!iso) return "Never seen";
  const diff_ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff_ms / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

function invite_sent_relative(iso: string): string {
  const diff_ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff_ms / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function activity_icon_color(event_type: string): string {
  if (["member_joined", "invite_sent", "group_created"].includes(event_type)) return "text-indigo-500";
  if (["member_removed", "invite_revoked", "group_deleted"].includes(event_type)) return "text-red-500";
  if (["security_policy_updated", "security_notify_sent"].includes(event_type)) return "text-green-500";
  if (["storage_updated", "admin_transferred"].includes(event_type)) return "text-blue-500";
  if (["domain_shared"].includes(event_type)) return "text-violet-500";
  if (["retention_updated"].includes(event_type)) return "text-amber-500";
  return "text-txt-muted";
}

function format_activity_time(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function activity_event_text(entry: { event_type: string; actor_username: string | null; target_username: string | null }): string {
  const actor = entry.actor_username ?? "Someone";
  const target = entry.target_username;
  switch (entry.event_type) {
    case "member_joined": return target ? `${target} joined the family` : "A member joined";
    case "member_removed": return target ? `${actor} removed ${target}` : `${actor} removed a member`;
    case "member_left": return target ? `${target} left the family` : "A member left";
    case "admin_transferred": return target ? `${actor} transferred admin to ${target}` : `${actor} transferred admin`;
    case "group_created": return `${actor} created a group`;
    case "group_deleted": return `${actor} deleted a group`;
    case "filter_created": return `${actor} created a filter`;
    case "domain_shared": return target ? `${actor} shared a domain with ${target}` : `${actor} shared a domain`;
    case "retention_updated": return `${actor} updated retention policy`;
    case "security_policy_updated": return `${actor} updated security policy`;
    case "security_notify_sent": return `${actor} sent a 2FA reminder to members`;
    case "invite_sent": return target ? `${actor} invited ${target}` : `${actor} sent an invite`;
    case "invite_revoked": return target ? `${actor} revoked invite for ${target}` : `${actor} revoked an invite`;
    case "storage_updated": return target ? `${actor} updated storage for ${target}` : `${actor} updated storage`;
    default: return EVENT_LABELS[entry.event_type] ?? entry.event_type;
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

  const save_storage = useCallback(async () => {
    const gb = parseFloat(storage_input);
    if (isNaN(gb) || gb < 1) return;
    try {
      await update_member_storage(member.user_id, Math.round(gb * 1073741824));
      show_toast("Storage updated", "success");
      set_editing(false);
      await on_reload();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
  }, [storage_input, member.user_id, on_reload, t]);

  const avatar_color = get_avatar_color(member.username);
  const badge_class = member.role === "owner" ? "aster_badge aster_badge_blue"
    : member.status === "grace" ? "aster_badge aster_badge_amber"
    : "aster_badge aster_badge_gray";
  const role_label = member.role === "owner" ? t("settings.family_member_owner")
    : member.status === "grace" ? t("settings.family_member_grace")
    : t("settings.family_member_member");

  const no_2fa = compliance && !compliance.has_2fa && member.role !== "owner";

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold select-none" style={{ backgroundColor: avatar_color }}>
        {member.username[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-txt-primary truncate">{member.username}@{member.email_domain}</span>
          <span className={badge_class}>{role_label}</span>
          {no_2fa && <span className="aster_badge aster_badge_amber">No 2FA</span>}
          {compliance?.has_2fa && <ShieldCheckIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
        </div>
        {editing ? (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
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
                {Math.max(0, Math.round(((pool_remaining_bytes ?? 0) / 1073741824) - (parseFloat(storage_input) - member.allocated_storage_bytes / 1073741824)))} GB remaining in pool
              </p>
            )}
            <div className="flex gap-1">
              <button onClick={save_storage} className="aster_btn aster_btn_primary aster_btn_sm">Save</button>
              <button onClick={() => set_editing(false)} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-txt-muted mt-0.5">{format_bytes(member.storage_used_bytes)} / {format_bytes(member.allocated_storage_bytes)}</div>
        )}
        <StorageBar used={member.storage_used_bytes} total={member.allocated_storage_bytes} />
        {compliance?.last_login && (
          <div className="text-[10px] text-txt-muted mt-0.5">Last seen {last_seen_relative(compliance.last_login)}</div>
        )}
      </div>
      {is_owner_view && member.role !== "owner" && !editing && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => set_editing(true)} className="p-1.5 text-txt-muted hover:text-txt-secondary" title={t("settings.family_storage_edit")}>
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={() => on_transfer(member)} className="p-1.5 text-txt-muted hover:text-accent-blue" title={t("settings.family_transfer_admin")}>
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
          <button onClick={() => on_remove(member)} className="p-1.5 text-txt-muted hover:text-red-500" title={t("settings.family_remove_member")}>
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function GroupsContent({ members }: { members: FamilyMemberInfo[] }) {
  const [groups, set_groups] = useState<OrgGroup[]>([]);
  const [loading, set_loading] = useState(true);
  const [new_name, set_new_name] = useState("");
  const [new_email_prefix, set_new_email_prefix] = useState("");
  const [creating, set_creating] = useState(false);
  const [expanded, set_expanded] = useState<string | null>(null);
  const [group_members, set_group_members] = useState<Record<string, OrgGroupMember[]>>({});
  const [adding_to, set_adding_to] = useState<string | null>(null);
  const [add_user_id, set_add_user_id] = useState("");

  const load_groups = useCallback(async () => {
    set_loading(true);
    try { const r = await list_org_groups(); set_groups(r.data ?? []); }
    catch { show_toast("Failed to load groups", "error"); }
    finally { set_loading(false); }
  }, []);

  useEffect(() => { load_groups(); }, [load_groups]);

  const handle_expand = async (gid: string) => {
    if (expanded === gid) { set_expanded(null); return; }
    set_expanded(gid);
    if (!group_members[gid]) {
      try { const r = await list_group_members(gid); if (r.data) set_group_members(p => ({ ...p, [gid]: r.data! })); }
      catch { show_toast("Failed to load members", "error"); }
    }
  };

  const handle_create = async () => {
    if (!new_name.trim() || creating) return;
    set_creating(true);
    try {
      const payload: { name: string; email_local_part?: string } = { name: new_name.trim() };
      if (new_email_prefix.trim()) payload.email_local_part = new_email_prefix.trim();
      const r = await create_org_group(payload);
      if (r.data) { set_groups(p => [...p, r.data!]); set_new_name(""); set_new_email_prefix(""); show_toast("Group created", "success"); }
    } catch { show_toast("Failed to create group", "error"); }
    finally { set_creating(false); }
  };

  const [confirm_delete_gid, set_confirm_delete_gid] = useState<string | null>(null);

  const handle_delete = (gid: string) => { set_confirm_delete_gid(gid); };
  const confirm_delete = async () => {
    if (!confirm_delete_gid) return;
    try { await delete_org_group(confirm_delete_gid); set_groups(p => p.filter(g => g.id !== confirm_delete_gid)); if (expanded === confirm_delete_gid) set_expanded(null); show_toast("Group deleted", "success"); }
    catch { show_toast("Failed to delete group", "error"); }
    finally { set_confirm_delete_gid(null); }
  };

  const handle_remove_member = async (gid: string, uid: string) => {
    try {
      await remove_group_member(gid, uid);
      set_group_members(p => ({ ...p, [gid]: (p[gid] ?? []).filter(m => m.user_id !== uid) }));
      set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: g.member_count - 1 } : g));
      show_toast("Member removed", "success");
    } catch { show_toast("Failed to remove member", "error"); }
  };

  const handle_add_member = async (gid: string) => {
    if (!add_user_id) return;
    try {
      await add_group_member(gid, add_user_id);
      const r = await list_group_members(gid);
      if (r.data) set_group_members(p => ({ ...p, [gid]: r.data! }));
      set_groups(p => p.map(g => g.id === gid ? { ...g, member_count: g.member_count + 1 } : g));
      set_adding_to(null); set_add_user_id(""); show_toast("Member added", "success");
    } catch { show_toast("Failed to add member", "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Group name" value={new_name} onChange={e => set_new_name(e.target.value)} onKeyDown={e => e.key === "Enter" && handle_create()} className="flex-1 h-9" />
        <Input placeholder="Email prefix (optional)" value={new_email_prefix} onChange={e => set_new_email_prefix(e.target.value)} className="flex-1 h-9" />
        <button onClick={handle_create} disabled={creating || !new_name.trim()}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium text-white flex-shrink-0 disabled:opacity-50 transition-colors bg-accent-blue hover:opacity-90">
          <PlusIcon className="w-4 h-4" /> Create
        </button>
      </div>
      <p className="text-[11px] text-txt-muted">Email prefix is optional - creates a group address like <span className="font-mono">team@yourdomain.com</span></p>
      {loading ? (
        <SkeletonRows count={3} has_icon={false} />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <UserGroupIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">No groups yet</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">Create a group to route email to multiple family members at once.</p>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {groups.map(g => {
            const is_open = expanded === g.id;
            const gm = group_members[g.id] ?? [];
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 py-3">
                  <button onClick={() => handle_expand(g.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {is_open ? <ChevronDownIcon className="w-4 h-4 text-txt-muted flex-shrink-0" /> : <ChevronRightIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />}
                    {g.email_local_part && <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Has email address" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-txt-primary truncate">{g.name}</span>
                      {g.email_local_part && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">
                            {g.email_local_part}{g.domain_name ? `@${g.domain_name}` : "@your-domain.com"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="aster_badge aster_badge_gray flex-shrink-0">{g.member_count}</span>
                  </button>
                  <button onClick={() => handle_delete(g.id)} className="p-1.5 text-txt-muted hover:text-red-500 flex-shrink-0" title="Delete group" aria-label="Delete group"><TrashIcon className="w-4 h-4" /></button>
                </div>
                <div className={`overflow-hidden transition-all duration-200 ${is_open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="pl-6 pb-3 space-y-1">
                    {gm.length === 0 ? (
                      <p className="text-xs text-txt-muted">No members.{" "}
                        <button onClick={() => { set_adding_to(g.id); }} className="text-accent-blue hover:underline">Add someone</button>
                      </p>
                    ) : (
                      <div className="divide-y divide-edge-secondary">
                        {gm.map(m => (
                          <div key={m.user_id} className="flex items-center justify-between py-2">
                            <span className="text-sm text-txt-primary">{m.username}@{m.email_domain}</span>
                            <button onClick={() => handle_remove_member(g.id, m.user_id)} className="p-1 text-txt-muted hover:text-red-500" title="Remove from group" aria-label="Remove from group"><XMarkIcon className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {adding_to === g.id ? (
                      <div className="flex items-center gap-2 pt-2">
                        <Select value={add_user_id || "_none"} onValueChange={v => set_add_user_id(v === "_none" ? "" : v)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select member..." />
                          </SelectTrigger>
                          <SelectContent>
                            {members.filter(m => !gm.some(x => x.user_id === m.user_id)).map(m => (
                              <SelectItem key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button onClick={() => handle_add_member(g.id)} disabled={!add_user_id} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">Add</button>
                        <button onClick={() => { set_adding_to(null); set_add_user_id(""); }} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { set_adding_to(g.id); set_add_user_id(""); }} className="text-xs text-accent-blue hover:underline pt-1">Add member</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirm_delete_gid} onOpenChange={open => !open && set_confirm_delete_gid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this group and remove all its members. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm_delete} className="aster_btn_destructive">
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivityContent() {
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");

  const load_page = useCallback(async (p: number, ft?: string) => {
    set_loading(true);
    try {
      const r = await get_activity_log(p, 20, ft);
      if (r.data) {
        if (p === 1) set_entries(r.data.entries); else set_entries(prev => [...prev, ...r.data!.entries]);
        set_total(r.data.total); set_page(p);
      }
    } catch { show_toast("Failed to load activity", "error"); }
    finally { set_loading(false); }
  }, []);

  useEffect(() => { set_entries([]); load_page(1, filter_type || undefined); }, [load_page, filter_type]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-txt-muted">{total} event{total !== 1 ? "s" : ""}</span>
        <Select value={filter_type || "all"} onValueChange={v => set_filter_type(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {Object.entries(EVENT_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {loading && entries.length === 0 ? (
        <SkeletonRows count={4} />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <ChartBarIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">No activity yet</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">Member joins, security changes, and administrative actions will appear here.</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-left">
            {["Member joins", "Security changes", "Filter updates", "Domain sharing", "Storage changes", "Invite activity"].map(e => (
              <div key={e} className="flex items-center gap-1.5 text-xs text-txt-muted">
                <div className="w-1 h-1 rounded-full bg-edge-secondary flex-shrink-0" />
                {e}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 py-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                ['member_removed','invite_revoked','group_deleted'].includes(entry.event_type)
                  ? 'bg-red-500/10' : 'bg-surf-secondary'
              }`}>
                {['member_joined','invite_sent'].includes(entry.event_type) ? <UserPlusIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} /> :
                 ['member_removed','invite_revoked','group_deleted'].includes(entry.event_type) ? <TrashIcon className="w-4 h-4 text-red-500" /> :
                 ['admin_transferred','storage_updated'].includes(entry.event_type) ? <ArrowsRightLeftIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} /> :
                 ['security_policy_updated','security_notify_sent'].includes(entry.event_type) ? <ShieldCheckIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} /> :
                 ['retention_updated'].includes(entry.event_type) ? <ArchiveBoxIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} /> :
                 ['domain_shared'].includes(entry.event_type) ? <GlobeAltIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} /> :
                 <PlusIcon className={`w-4 h-4 ${activity_icon_color(entry.event_type)}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-txt-primary">{activity_event_text(entry)}</span>
                <p className="text-xs text-txt-muted mt-0.5" title={format_activity_time(entry.created_at)}>{last_seen_relative(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {entries.length < total && (
        <button onClick={() => load_page(page + 1, filter_type || undefined)} disabled={loading} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">
          {loading ? <Spinner size="sm" /> : "Load more"}
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
};

const FILTER_FIELD_LABELS: Record<string, string> = {
  from: "Sender",
  to: "Recipient",
  domain: "Domain",
  subject: "Subject",
};

const FILTER_ACTION_LABELS: Record<string, string> = {
  trash: "Move to Trash",
  block: "Block",
  archive: "Archive",
  mark_read: "Mark as read",
};

const FILTER_ACTION_COLORS: Record<string, string> = {
  trash: "#ef4444",
  block: "#ef4444",
  archive: "#6366f1",
  mark_read: "#10b981",
};

interface FilterCardProps {
  filter: OrgFilter;
  on_toggle: (f: OrgFilter) => void;
  on_delete: (id: string) => void;
}

function FilterCard({ filter, on_toggle, on_delete }: FilterCardProps) {
  const dot_color = FILTER_FIELD_COLORS[filter.field] ?? "#a3a3a3";
  const action_color = FILTER_ACTION_COLORS[filter.action] ?? "#a3a3a3";
  const action_label = FILTER_ACTION_LABELS[filter.action] ?? filter.action;
  const field_label = FILTER_FIELD_LABELS[filter.field] ?? filter.field;

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
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); on_toggle(filter); }}
            className="p-1.5 text-txt-muted hover:text-txt-primary"
            title={filter.is_enabled ? "Disable filter" : "Enable filter"}
          >
            {filter.is_enabled
              ? <CheckCircleIcon className="w-4 h-4" style={{ color: "var(--accent-blue)" }} />
              : <XCircleIcon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); on_delete(filter.id); }}
            className="p-1.5 text-txt-muted hover:text-red-500"
            title="Delete filter"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FiltersContent() {
  const [filters, set_filters] = useState<OrgFilter[]>([]);
  const [loading, set_loading] = useState(true);
  const [show_form, set_show_form] = useState(false);
  const [creating, set_creating] = useState(false);
  const [form, set_form] = useState({ name: "", value: "", field: "from", action: "trash" });

  const load = useCallback(async () => {
    try { const r = await list_org_filters(); if (r.data) set_filters(r.data); }
    catch { show_toast("Failed to load filters", "error"); }
    finally { set_loading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.value.trim()) return;
    set_creating(true);
    try {
      const r = await create_org_filter({ name: form.name.trim(), filter_type: "block", field: form.field, value: form.value.trim(), action: form.action });
      if (r.data) { set_filters(f => [...f, r.data!]); set_form({ name: "", value: "", field: "from", action: "trash" }); set_show_form(false); show_toast("Filter created", "success"); }
    } catch { show_toast("Failed to create filter", "error"); }
    finally { set_creating(false); }
  };

  const toggle_f = async (f: OrgFilter) => {
    try {
      const r = await update_org_filter(f.id, { is_enabled: !f.is_enabled });
      if (r.data) set_filters(fs => fs.map(x => x.id === f.id ? r.data! : x));
    } catch { show_toast("Failed to update filter", "error"); }
  };

  const del_f = async (id: string) => {
    try { await delete_org_filter(id); set_filters(f => f.filter(x => x.id !== id)); show_toast("Filter deleted", "success"); }
    catch { show_toast("Failed to delete filter", "error"); }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <FunnelIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              Org-wide filters
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
              New filter
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          Filters apply to all family members' inboxes org-wide.
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
          <ModalTitle>New org-wide filter</ModalTitle>
          <ModalDescription>Applies to all family members' inboxes automatically.</ModalDescription>
        </ModalHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">Filter name</label>
            <Input placeholder="e.g. Block spam domain" value={form.name} onChange={e => set_form(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">Condition</label>
            <div className="flex gap-2">
              <Select value={form.field} onValueChange={v => set_form(f => ({ ...f, field: v }))}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="from">Sender (from)</SelectItem>
                  <SelectItem value="to">Recipient (to)</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="subject">Subject</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="value, domain, keyword..." className="flex-1" value={form.value} onChange={e => set_form(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">Action</label>
            <Select value={form.action} onValueChange={v => set_form(f => ({ ...f, action: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trash">Move to Trash</SelectItem>
                <SelectItem value="block">Block sender</SelectItem>
                <SelectItem value="archive">Archive</SelectItem>
                <SelectItem value="mark_read">Mark as read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => { set_show_form(false); set_form({ name: "", value: "", field: "from", action: "trash" }); }}>Cancel</Button>
          <Button variant="depth" onClick={create} disabled={creating || !form.name.trim() || !form.value.trim()}>
            {creating ? <Spinner size="sm" /> : "Create filter"}
          </Button>
        </ModalFooter>
      </Modal>

      {!loading && filters.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <FunnelIcon className="w-12 h-12 mx-auto mb-2 text-txt-tertiary" />
          <p className="text-sm text-txt-muted mb-1">No org-wide filters</p>
          <p className="text-xs text-txt-muted">Create filters to apply rules across all member inboxes.</p>
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
    </div>
  );
}

function DomainsContent({ members }: { members: FamilyMemberInfo[] }) {
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [sharing, set_sharing] = useState<string | null>(null);
  const [share_uid, set_share_uid] = useState("");

  useEffect(() => {
    list_family_domains()
      .then(r => { if (r.data) set_domains(r.data); })
      .catch(() => show_toast("Failed to load domains", "error"))
      .finally(() => set_loading(false));
  }, []);

  const do_share = async (dn: string) => {
    if (!share_uid) return;
    try {
      await share_domain(dn, share_uid, true);
      set_domains(d => d.map(x => x.domain_name === dn ? { ...x, shared_with_count: x.shared_with_count + 1 } : x));
      set_sharing(null); set_share_uid(""); show_toast("Domain shared", "success");
    } catch { show_toast("Failed to share domain", "error"); }
  };

  const do_revoke = async (dn: string, uid: string) => {
    try {
      await revoke_domain_share(dn, uid);
      set_domains(d => d.map(x => x.domain_name === dn ? { ...x, shared_with_count: Math.max(0, x.shared_with_count - 1) } : x));
      show_toast("Domain share revoked", "success");
    } catch { show_toast("Failed to revoke domain share", "error"); }
  };

  const nav_aliases = () => window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "aliases" }));

  if (loading) return <div className="flex justify-center items-center gap-2 py-8"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Share custom domains so family members can create aliases on them.</p>
      {domains.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <GlobeAltIcon className="w-8 h-8 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">No custom domains in this family</p>
          <p className="text-xs text-txt-muted text-center max-w-xs">Custom domains let family members send from their own @yourdomain.com addresses.</p>
          <button onClick={nav_aliases} className="aster_btn aster_btn_primary aster_btn_sm mt-1">
            Add a domain
          </button>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {domains.map(d => {
            const owner_color = get_avatar_color(d.owner_username);
            return (
              <div key={d.domain_name} className="py-3 hover:bg-surf-secondary/50 transition-colors rounded-lg px-2 -mx-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold" style={{ backgroundColor: owner_color }}>
                      {d.owner_username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-txt-primary">{d.domain_name}</span>
                        {d.dkim_verified ? <span className="aster_badge aster_badge_green">Verified</span> : <span className="aster_badge aster_badge_amber">Unverified</span>}
                        {d.shared_with_count > 0 && (
                          <div className="flex items-center gap-0.5">
                            {members.filter(m => m.user_id !== d.owner_user_id).slice(0, d.shared_with_count).map(m => (
                              <div key={m.user_id} className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-edge-secondary -ml-1 first:ml-0"
                                style={{ backgroundColor: get_avatar_color(m.username) }} title={`${m.username}@${m.email_domain}`}>
                                {m.username[0]?.toUpperCase()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-txt-muted mt-0.5">Owned by {d.owner_username}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (d.dkim_verified) { set_sharing(d.domain_name); set_share_uid(""); } }}
                    disabled={!d.dkim_verified}
                    title={d.dkim_verified ? "Share with members" : "Verify DKIM first to enable sharing"}
                    className="text-sm text-accent-blue hover:underline flex-shrink-0 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none">
                    Share
                  </button>
                </div>
                {sharing === d.domain_name && (
                  <div className="mt-3 ml-10 space-y-2">
                    <div className="flex gap-2">
                      <Select value={share_uid || "_none"} onValueChange={v => set_share_uid(v === "_none" ? "" : v)}>
                        <SelectTrigger className="flex-1 text-xs">
                          <SelectValue placeholder="Add a member..." />
                        </SelectTrigger>
                        <SelectContent>
                          {members.filter(m => m.user_id !== d.owner_user_id).map(m => (
                            <SelectItem key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => do_share(d.domain_name)} disabled={!share_uid} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">Add</button>
                      <button onClick={() => set_sharing(null)} className="aster_btn aster_btn_ghost aster_btn_sm">Done</button>
                    </div>
                    {d.shared_with_count > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wide">Currently shared with</p>
                        {members.filter(m => m.user_id !== d.owner_user_id).slice(0, d.shared_with_count).map(m => (
                          <div key={m.user_id} className="flex items-center gap-2 py-0.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0" style={{ backgroundColor: get_avatar_color(m.username) }}>
                              {m.username[0]?.toUpperCase()}
                            </div>
                            <span className="text-xs text-txt-primary flex-1 truncate">{m.username}@{m.email_domain}</span>
                            <button onClick={() => do_revoke(d.domain_name, m.user_id)} className="text-[10px] text-red-500 hover:underline flex-shrink-0">Revoke</button>
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

function SecurityContent() {
  const [policy, set_policy] = useState<SecurityPolicy | null>(null);
  const [compliance, set_compliance] = useState<MemberComplianceInfo[]>([]);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    get_security_policy()
      .then(r => { if (r.data) set_policy(r.data); })
      .catch(() => { show_toast("Failed to load security settings", "error"); set_policy({ require_2fa: false, require_2fa_grace_days: 7, allow_imap_smtp: true, max_sessions_per_member: null, session_timeout_hours: null, block_external_forwarding: false }); });
    get_member_compliance()
      .then(r => { if (r.data) set_compliance(r.data); })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!policy) return;
    set_saving(true);
    try {
      const r = await update_security_policy(policy);
      if (r.data) { set_policy(r.data); show_toast("Security policy saved", "success"); }
    } catch { show_toast("Failed to save", "error"); }
    finally { set_saving(false); }
  };

  if (!policy) return (
    <div className="flex justify-center items-center gap-2 py-8">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span>
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
            <span className="text-txt-primary font-medium">{with_2fa} of {total_members} members have 2FA enabled</span>
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
      {non_2fa > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-txt-primary flex-1 min-w-0">
            {non_2fa} member{non_2fa !== 1 ? "s haven't" : " hasn't"} enabled 2FA
          </p>
          <button
            className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex-shrink-0"
            onClick={async () => {
              try {
                const r = await notify_non_compliant_2fa();
                if (r.data) show_toast(`Reminder sent to ${r.data.notified} member${r.data.notified !== 1 ? 's' : ''}`, "success");
              } catch { show_toast("Failed to send reminder", "error"); }
            }}
          >
            Send reminder
          </button>
        </div>
      )}
      <div className="divide-y divide-edge-secondary">
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              Require two-factor authentication
              {policy.require_2fa && <span className="aster_badge aster_badge_green text-[10px]">Active</span>}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">All members must enable 2FA to access their accounts</p>
          </div>
          <Switch
            checked={policy.require_2fa}
            onCheckedChange={val => set_policy(p => p ? { ...p, require_2fa: val } : p)}
          />
        </div>
        {policy.require_2fa && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">Grace period for new members</p>
              <p className="text-sm mt-0.5 text-txt-muted">Days before 2FA is enforced after joining</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Input type="number" min="0" max="30" value={policy.require_2fa_grace_days}
                onChange={e => set_policy(p => p ? { ...p, require_2fa_grace_days: parseInt(e.target.value) || 0 } : p)}
                className="w-16" />
              <span className="text-xs text-txt-muted">days</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">Max active sessions per member</p>
            <p className="text-sm mt-0.5 text-txt-muted">Limit simultaneous device sign-ins. Leave blank for no limit.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input type="number" min="1" className="w-16" placeholder="No limit"
              value={policy.max_sessions_per_member ?? ""}
              onChange={e => set_policy(p => p ? { ...p, max_sessions_per_member: e.target.value ? parseInt(e.target.value) : null } : p)} />
            <span className="text-xs text-txt-muted">sessions</span>
          </div>
        </div>
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">Auto sign-out after</p>
            <p className="text-sm mt-0.5 text-txt-muted">Sign members out after N hours of inactivity.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input type="number" min="1" className="w-16" placeholder="Never"
              value={policy.session_timeout_hours ?? ""}
              onChange={e => set_policy(p => p ? { ...p, session_timeout_hours: e.target.value ? parseInt(e.target.value) : null } : p)} />
            <span className="text-xs text-txt-muted">hours</span>
          </div>
        </div>
      </div>
      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Security Policy"}
      </button>
      {compliance.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary">Member Compliance</h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="divide-y divide-edge-secondary">
            {compliance.map(m => {
              const color = get_avatar_color(m.username);
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-3.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                    <p className="text-xs text-txt-muted mt-0.5">
                      {m.session_count === 0 ? "No active sessions" : `${m.session_count} active session${m.session_count !== 1 ? "s" : ""}`}
                      {m.last_login ? <span> · last seen {last_seen_relative(m.last_login)}</span> : <span> · Never signed in</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {m.has_2fa ? <span className="aster_badge aster_badge_green">2FA</span> : <span className="aster_badge aster_badge_amber">No 2FA</span>}
                    {m.imap_enabled && <span className="aster_badge aster_badge_gray">IMAP</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionContent() {
  const [policy, set_policy] = useState<DataRetentionPolicy | null>(null);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    get_data_retention()
      .then(r => { if (r.data) set_policy(r.data); })
      .catch(() => { show_toast("Failed to load retention settings", "error"); set_policy({ trash_retention_days: null, spam_retention_days: 30, sent_retention_days: null, all_mail_retention_days: null, enforce_on_members: false }); });
  }, []);

  const save = async () => {
    if (!policy) return;
    set_saving(true);
    try {
      const r = await update_data_retention(policy);
      if (r.data) { set_policy(r.data); show_toast("Retention policy saved", "success"); }
    } catch { show_toast("Failed to save", "error"); }
    finally { set_saving(false); }
  };

  if (!policy) return (
    <div className="flex justify-center items-center gap-2 py-8">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-surf-secondary px-3 py-2.5 border border-edge-secondary">
        <InformationCircleIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-txt-muted">Set limits to auto-delete old messages. Leave blank to keep forever. Applies to all members when "Enforce on all members" is on.</p>
      </div>
      <div className="divide-y divide-edge-secondary">
        {([
          { key: "trash_retention_days" as const, label: "Trash", hint: "Auto-delete trashed mail" },
          { key: "spam_retention_days" as const, label: "Spam", hint: "Auto-delete spam (default 30 days)" },
          { key: "sent_retention_days" as const, label: "Sent", hint: "Auto-delete sent mail" },
          { key: "all_mail_retention_days" as const, label: "All Mail", hint: "Hard limit on all messages" },
        ]).map(({ key, label, hint }) => {
          return (
            <div key={key} className="flex items-center justify-between py-4">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-txt-primary">{label}</p>
                <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Input type="number" min="0"
                  value={(policy[key] as number | null) ?? ""}
                  onChange={e => set_policy(p => p ? { ...p, [key]: e.target.value ? parseInt(e.target.value) : null } : p)}
                  className="w-20" placeholder="Off" />
                <span className="text-xs text-txt-muted">days</span>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
            <p className={policy.enforce_on_members ? "text-sm mt-0.5 text-amber-500 dark:text-amber-400 font-medium" : "text-sm mt-0.5 text-txt-muted"}>
              {policy.enforce_on_members ? "Enforced on all members - they cannot override" : "When enabled, these limits apply to all member accounts. Members cannot override."}
            </p>
          </div>
          <Switch
            checked={policy.enforce_on_members}
            onCheckedChange={val => set_policy(p => p ? { ...p, enforce_on_members: val } : p)}
          />
        </div>
      </div>
      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Retention Policy"}
      </button>
    </div>
  );
}

export function FamilySection({ is_family_plan }: FamilySectionProps) {
  const { t } = use_i18n();
  const [group, set_group] = useState<FamilyGroupResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [tab, set_tab] = useState<FamilyTab>("overview");
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
  const [wizard_open, set_wizard_open] = useState(false);
  const [wizard_step, set_wizard_step] = useState(1);
  const [wizard_invite_email, set_wizard_invite_email] = useState("");
  const [wizard_invite_gb, set_wizard_invite_gb] = useState("500");
  const [wizard_invite_loading, set_wizard_invite_loading] = useState(false);
  const [wizard_sent_email, set_wizard_sent_email] = useState("");

  // Preload compliance map so security snapshot and member rows show 2FA status immediately
  useEffect(() => {
    if (group?.viewer_role !== "owner" || Object.keys(compliance_map).length > 0) return;
    get_member_compliance()
      .then(r => {
        if (r.data) {
          const map: Record<string, MemberComplianceInfo> = {};
          r.data.forEach(m => { map[m.user_id] = m; });
          set_compliance_map(map);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.viewer_role, compliance_map]);

  const load_group = useCallback(async () => {
    try {
      const res = await get_family_group();
      if (res.data) {
        set_group(res.data);
        const active = res.data.members.filter(m => m.status === "active").length;
        const remaining_seats = Math.max(1, res.data.max_members - active);
        const used_alloc = res.data.members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
        const remaining_bytes = res.data.storage_pool_bytes - used_alloc;
        const default_gb = String(Math.max(1, Math.round(remaining_bytes / remaining_seats / 1073741824)));
        set_invite_storage_gb(default_gb);
        set_wizard_invite_gb(default_gb);
        if (
          res.data.viewer_role === "owner" &&
          res.data.members.filter(m => m.status !== "removed").length === 1 &&
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

  const is_owner = group?.viewer_role === "owner";
  const has_pending_link = group?.pending_invites.some(i => i.link_only) ?? false;


  const handle_upgrade_to_family = async () => {
    set_changing_plan(true);
    try {
      const res = await change_plan("family", "year");
      if (res.ok) { show_toast("Plan upgraded successfully", "success"); window.location.reload(); }
      else {
        const res2 = await change_plan("family", "month");
        if (res2.ok) { show_toast("Plan upgraded successfully", "success"); window.location.reload(); }
        else show_toast(t("settings.failed_save_setting"), "error");
      }
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_changing_plan(false); }
  };


  const handle_wizard_invite = async () => {
    const email = wizard_invite_email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show_toast("Enter a valid email address", "error"); return;
    }
    const storage = Math.round(parseFloat(wizard_invite_gb) * 1073741824);
    if (!wizard_invite_gb || isNaN(storage) || storage < 1) return;
    set_wizard_invite_loading(true);
    try {
      await invite_member(email, storage);
      set_wizard_sent_email(email);
      set_wizard_step(3);
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_wizard_invite_loading(false); }
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
      show_toast("Enter a valid email address", "error"); return;
    }
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);
    if (!invite_storage_gb || isNaN(storage) || storage < 1) return;
    set_invite_loading(true);
    try {
      await invite_member(email, storage);
      show_toast(t("settings.family_invite_sent"), "success");
      set_invite_email(""); set_show_invite_form(false);
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_invite_loading(false); }
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
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_invite_loading(false); }
  };

  const handle_revoke_invite = async (invite_id: string) => {
    try {
      await revoke_invite(invite_id);
      show_toast("Invite revoked", "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
  };

  const handle_remove_confirm = async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      await remove_family_member(remove_target.user_id);
      show_toast("Member removed", "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_remove_target(null); }
  };

  const handle_transfer_confirm = async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      await transfer_family_admin(transfer_target.user_id);
      show_toast("Admin transferred", "success");
      await load_group();
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_transfer_target(null); }
  };

  const handle_leave_confirm = async () => {
    set_action_loading(true);
    try {
      await leave_family();
      show_toast(t("settings.family_leave"), "success");
      set_group(null);
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_action_loading(false); set_show_leave_dialog(false); }
  };

  if (!is_family_plan || loading) return null;

  if (!group) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">Family</h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        <div className="flex justify-center items-center gap-2 py-8">
          <Spinner size="sm" />
          <span className="text-sm text-txt-muted">Setting up your family plan...</span>
        </div>
        <button onClick={() => window.location.reload()} className="aster_btn aster_btn_secondary aster_btn_sm">Refresh</button>
      </div>
    );
  }

  const active_members = group.members.filter(m => m.status !== "removed");
  const pool_used = group.members.reduce((s, m) => s + m.storage_used_bytes, 0);
  const pool_pct = storage_pct(pool_used, group.storage_pool_bytes);
  const seats_remaining = group.max_members - active_members.length;
  const seats_full = active_members.length >= group.max_members;

  type OwnTab = { id: FamilyTab; label: string; Icon: React.ElementType };
  const owner_tabs: OwnTab[] = is_owner ? [
    { id: "overview", label: "Overview", Icon: UserGroupIcon },
    { id: "members", label: "Members", Icon: UserPlusIcon },
    { id: "groups", label: "Groups", Icon: UserGroupIcon },
    { id: "activity", label: "Activity", Icon: ChartBarIcon },
    { id: "filters", label: "Filters", Icon: FunnelIcon },
    { id: "domains", label: "Domains", Icon: GlobeAltIcon },
    { id: "security", label: "Security", Icon: ShieldCheckIcon },
    { id: "retention", label: "Retention", Icon: ArchiveBoxIcon },
  ] : [];

  return (
    <div className="space-y-4 w-full min-w-0">
      <div>
        <h2 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          Family
          <span className="aster_badge aster_badge_blue">{group.plan_name}</span>
        </h2>
        <p className="text-sm text-txt-secondary mt-0.5">
          {active_members.length} of {group.max_members} members · {seats_remaining} seat{seats_remaining !== 1 ? "s" : ""} available
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

      {(tab === "overview" || !is_owner) && (
        <>
          {is_owner && (active_members.length === 1 || group.pending_invites.length > 0) && (() => {
            const step1_done = true;
            const step2_done = active_members.length > 1 || group.pending_invites.length > 0;
            const security_policy_done = Object.values(compliance_map).length > 0 &&
              (() => { try { return (group as unknown as { security_policy?: { require_2fa?: boolean } }).security_policy?.require_2fa === true; } catch { return false; } })();
            const compliance_all_2fa = Object.values(compliance_map).length > 1 &&
              Object.values(compliance_map).every(m => m.has_2fa);
            const checklist = [
              { label: "Subscribe to a family plan", done: step1_done, tab_target: null as FamilyTab | null },
              { label: "Invite your first member", done: step2_done, tab_target: "members" as FamilyTab },
              { label: "Enable security policy", done: security_policy_done, tab_target: "security" as FamilyTab },
              { label: "Configure 2FA reminder", done: compliance_all_2fa, tab_target: "security" as FamilyTab },
            ];
            const completed = checklist.filter(c => c.done).length;
            return (
              <div className="rounded-xl border border-edge-secondary bg-surf-secondary p-4 mb-4">
                <p className="text-sm font-semibold text-txt-primary mb-2">Get started with your family plan</p>
                <div className="w-full h-1.5 bg-edge-secondary rounded-full mb-3">
                  <div
                    className="h-full bg-accent-blue rounded-full transition-all"
                    style={{ width: `${(completed / 4) * 100}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {checklist.map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      {item.done ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-edge-secondary flex-shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${item.done ? "text-txt-muted line-through" : "text-txt-primary"}`}>
                        {item.label}
                      </span>
                      {!item.done && item.tab_target && (
                        <button
                          onClick={() => set_tab(item.tab_target!)}
                          className="p-0.5 text-txt-muted hover:text-txt-secondary flex-shrink-0"
                          aria-label={`Go to ${item.tab_target}`}
                        >
                          <ChevronRightIcon className="w-4 h-4" />
                        </button>
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
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">Members</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary tabular-nums">
                {active_members.length}
                <span className="text-base font-normal text-txt-muted"> / {group.max_members}</span>
              </p>
              <p className="text-xs text-txt-muted mt-1">
                {seats_remaining} seat{seats_remaining !== 1 ? "s" : ""} available
                {group.pending_invites.length > 0 && <span className="text-amber-500"> · {group.pending_invites.length} pending</span>}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CircleStackIcon className="w-3.5 h-3.5 text-txt-muted" />
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">Storage used</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary tabular-nums">
                {format_bytes(pool_used)}
              </p>
              <p className="text-xs text-txt-muted mt-1">of {format_bytes(group.storage_pool_bytes)} total</p>
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
                <p className="text-xs font-medium text-txt-muted uppercase tracking-wide">Encryption</p>
              </div>
              <p className="text-2xl font-bold text-txt-primary mt-1.5">E2E</p>
              <p className="text-xs text-txt-muted mt-1">Zero-access · quantum-safe</p>
            </div>
          </div>

          <div>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                Members
                <span className="ml-auto text-xs text-txt-muted">{active_members.length} of {group.max_members}</span>
              </h3>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center">
                {active_members.slice(0, 5).map((m, i) => (
                  <div key={m.user_id}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold${i > 0 ? " -ml-2" : ""}`}
                    style={{ backgroundColor: get_avatar_color(m.username) }}
                    title={m.username + "@" + m.email_domain}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                ))}
                {active_members.length > 5 && (
                  <div className="w-8 h-8 rounded-full bg-surf-secondary flex items-center justify-center text-xs font-medium text-txt-muted -ml-2">
                    +{active_members.length - 5}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-txt-primary">{active_members.length} member{active_members.length !== 1 ? "s" : ""}</p>
                <p className="text-xs text-txt-muted">{seats_remaining} seat{seats_remaining !== 1 ? "s" : ""} available</p>
              </div>
              {is_owner && (
                <button onClick={() => set_tab("members")} className="ml-auto aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5">
                  <UserPlusIcon className="w-3.5 h-3.5" /> Manage
                </button>
              )}
            </div>
          </div>

          {is_owner && (
            <button
              onClick={() => set_tab("security")}
              className="w-full text-left rounded-xl border border-edge-secondary px-4 py-3 hover:bg-surf-secondary transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                  <span className="text-sm font-medium text-txt-primary">Security</span>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-txt-muted group-hover:text-txt-secondary transition-colors" />
              </div>
              {(() => {
                const comp_members = Object.values(compliance_map);
                if (comp_members.length === 0) {
                  return (
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-txt-muted"><Spinner size="sm" /> Checking compliance...</span>
                    </div>
                  );
                }
                const compliant = comp_members.filter(m => m.has_2fa).length;
                const total = comp_members.length;
                const all_ok = compliant === total;
                return (
                  <div className="flex items-center justify-between mt-2.5">
                    <span className={all_ok ? "aster_badge aster_badge_green" : "aster_badge aster_badge_amber"}>
                      {all_ok ? "All members have 2FA" : `${compliant}/${total} have 2FA`}
                    </span>
                  </div>
                );
              })()}
            </button>
          )}

          {is_owner && seats_full && group.plan_name === "Duo" && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-edge-secondary">
              <InformationCircleIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
              <p className="text-sm text-txt-secondary flex-1">All 2 seats used. Upgrade to Family plan for up to 6 members.</p>
              <button onClick={handle_upgrade_to_family} disabled={changing_plan} className="aster_btn aster_btn_primary aster_btn_sm flex-shrink-0 disabled:opacity-50">Upgrade</button>
            </div>
          )}

          {is_owner && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "billing" }))}
              className="flex items-center gap-2 text-xs text-accent-blue hover:underline py-1"
            >
              <ArrowRightIcon className="w-3.5 h-3.5" />
              Manage billing & plan changes
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
                <div className="flex flex-col items-center gap-3 py-8">
                  <UserGroupIcon className="w-8 h-8 text-txt-muted" />
                  <div className="text-center">
                    <p className="text-base font-semibold text-txt-primary">No members yet</p>
                    <p className="text-sm text-txt-muted mt-1">Invite someone to share this family plan</p>
                  </div>
                  <button onClick={() => set_show_invite_form(true)} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5">
                    <UserPlusIcon className="w-4 h-4" />
                    {t("settings.family_invite_member")}
                  </button>
                </div>
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
                <button onClick={() => set_show_invite_form(true)} className="flex items-center gap-2 text-sm text-accent-blue hover:underline py-1">
                  <UserPlusIcon className="w-4 h-4" />
                  Add another member
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="h-px bg-edge-secondary" />
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
                        <span className="text-sm text-txt-muted">GB</span>
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const pool = group.storage_pool_bytes;
                    const used_alloc = active_members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
                    const invite_bytes = Math.round(parseFloat(invite_storage_gb) || 0) * 1073741824;
                    const remaining = Math.max(0, pool - used_alloc - invite_bytes);
                    const used_pct = pool > 0 ? Math.min(100, (used_alloc / pool) * 100) : 0;
                    const invite_pct = pool > 0 ? Math.min(100 - used_pct, (invite_bytes / pool) * 100) : 0;
                    return (
                      <div>
                        <div className="w-full h-2 bg-edge-secondary rounded-full overflow-hidden flex mt-1">
                          <div className="h-full bg-accent-blue" style={{ width: `${used_pct}%` }} />
                          <div className="h-full bg-indigo-400 opacity-70" style={{ width: `${invite_pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-txt-muted mt-0.5">
                          <span>{format_bytes(used_alloc)} used</span>
                          <span>{format_bytes(remaining)} remaining</span>
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-txt-muted">{t("settings.family_member_storage")}</p>
                  <div className="flex gap-2">
                    <button onClick={handle_invite_email} disabled={invite_loading} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
                      <UserPlusIcon className="w-4 h-4" /> {t("settings.family_invite_send")}
                    </button>
                    <button onClick={handle_copy_link} disabled={invite_loading || has_pending_link}
                      className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
                      title={has_pending_link ? "Revoke the existing link first" : undefined}>
                      <LinkIcon className="w-4 h-4" /> {t("settings.family_invite_copy_link")}
                    </button>
                    <button onClick={() => set_show_invite_form(false)} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
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
                      <ClockIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-txt-primary">{inv.link_only ? t("settings.family_invite_link") : t("settings.family_invite_by_email")}</p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.family_invite_expires", { date: new Date(inv.expires_at).toLocaleDateString() })}
                          {inv.allocated_storage_bytes > 0 && <span> · <strong>{Math.round(inv.allocated_storage_bytes / 1073741824)} GB</strong> allocated</span>}
                          {inv.created_at && <span> · sent {invite_sent_relative(inv.created_at)}</span>}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handle_revoke_invite(inv.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600 flex-shrink-0">
                      {t("settings.family_invite_revoke")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "groups"    && is_owner && <GroupsContent members={active_members} />}
      {tab === "activity"  && is_owner && <ActivityContent />}
      {tab === "filters"   && is_owner && <FiltersContent />}
      {tab === "domains"   && is_owner && <DomainsContent members={active_members} />}
      {tab === "security"  && is_owner && <SecurityContent />}
      {tab === "retention" && is_owner && <RetentionContent />}


      {group && wizard_open && (
        <Modal is_open={wizard_open} on_close={close_wizard} size="md" close_on_overlay={false}>
          {wizard_step === 1 && (
            <>
              <ModalHeader>
                <div className="flex flex-col items-center gap-3 pt-2 pb-1">
                  <UserGroupIcon className="w-12 h-12 text-accent-blue" />
                  <ModalTitle className="text-xl font-bold text-center">Welcome to your family plan</ModalTitle>
                </div>
              </ModalHeader>
              <div className="px-6 pb-4 space-y-3 text-center">
                <ModalDescription className="sr-only">Family plan setup wizard</ModalDescription>
                <div>
                  <span className="aster_badge aster_badge_blue">{group.plan_name}</span>
                </div>
                <p className="text-sm text-txt-secondary">
                  You have <strong>{format_bytes(group.storage_pool_bytes)}</strong> of shared storage across up to <strong>{group.max_members} members</strong>.
                </p>
                <p className="text-xs text-txt-muted">Members can't access each other's emails - only shared storage.</p>
              </div>
              <ModalFooter>
                <Button variant="ghost" onClick={close_wizard}>Cancel</Button>
                <Button variant="depth" onClick={() => set_wizard_step(2)}>
                  Invite a member <ArrowRightIcon className="w-4 h-4 ml-1" />
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
                  <ModalTitle>Invite your first member</ModalTitle>
                  <ModalDescription>They'll receive an email with a link to join.</ModalDescription>
                </ModalHeader>
                <div className="px-6 pb-4 space-y-4">
                  <Input
                    type="email"
                    placeholder="member@example.com"
                    value={wizard_invite_email}
                    onChange={e => set_wizard_invite_email(e.target.value)}
                    autoFocus
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-txt-muted">Storage for this member</label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="1"
                          max={String(Math.max(1, Math.floor(pool_gb - used_gb)))}
                          value={wizard_invite_gb}
                          onChange={e => set_wizard_invite_gb(e.target.value)}
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-xs text-txt-muted">GB</span>
                      </div>
                    </div>
                    <p className={`text-xs mt-0.5 ${low_remaining ? "text-amber-500" : "text-txt-muted"}`}>
                      {remaining_gb.toFixed(1)} GB remaining in pool
                    </p>
                  </div>
                </div>
                <ModalFooter>
                  <Button variant="ghost" onClick={() => set_wizard_step(1)}>Back</Button>
                  <Button
                    variant="depth"
                    onClick={handle_wizard_invite}
                    disabled={!wizard_invite_email.trim() || wizard_invite_loading}
                  >
                    {wizard_invite_loading ? <Spinner size="sm" /> : "Send invite"}
                  </Button>
                </ModalFooter>
              </>
            );
          })()}
          {wizard_step === 3 && (
            <>
              <ModalHeader>
                <div className="flex flex-col items-center gap-3 pt-2 pb-1">
                  <CheckCircleIcon className="w-12 h-12 text-green-500" />
                  <ModalTitle className="text-xl font-bold text-center">Invite sent!</ModalTitle>
                </div>
              </ModalHeader>
              <div className="px-6 pb-4 space-y-3">
                <ModalDescription className="sr-only">Invite sent confirmation</ModalDescription>
                <p className="text-sm text-txt-secondary text-center">
                  We sent an invite to <strong>{wizard_sent_email}</strong>. They have 7 days to accept.
                </p>
                <div className="bg-surf-secondary rounded-lg p-3">
                  <p className="text-xs text-txt-muted">
                    <strong>Tip:</strong> You can manage storage, set security policies, and track activity from the tabs above.
                  </p>
                </div>
              </div>
              <ModalFooter>
                <Button variant="depth" onClick={close_wizard}>Get started</Button>
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
