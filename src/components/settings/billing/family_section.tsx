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
  ArrowsRightLeftIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  InformationCircleIcon,
  ReceiptPercentIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@aster/ui";
import { get_avatar_color } from "@/lib/avatar_color";
import { change_plan, get_billing_history, format_price, type BillingHistoryItem } from "@/services/api/billing";
import {
  list_org_groups, create_org_group, delete_org_group,
  list_group_members, add_group_member, remove_group_member,
  get_activity_log,
  list_org_filters, create_org_filter, update_org_filter, delete_org_filter,
  list_family_domains, share_domain,
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  get_member_compliance,
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
  storage_updated: "Storage updated",
};

interface FamilySectionProps {
  is_family_plan: boolean;
}

function storage_pct(used: number, total: number) {
  return total > 0 ? Math.min(100, (used / total) * 100) : 0;
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

// â”€â”€ Member row (overview read-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MemberRow({ member, is_owner_view, on_remove, on_transfer, on_reload }: {
  member: FamilyMemberInfo;
  is_owner_view: boolean;
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

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold select-none" style={{ backgroundColor: avatar_color }}>
        {member.username[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-txt-primary truncate">{member.username}@{member.email_domain}</span>
          <span className={badge_class}>{role_label}</span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input type="number" min="1" value={storage_input} onChange={e => set_storage_input(e.target.value)}
              className="w-16 text-xs border border-edge-secondary rounded px-1.5 py-0.5 bg-transparent text-txt-primary" autoFocus />
            <span className="text-xs text-txt-muted">GB</span>
            <button onClick={save_storage} className="text-green-600 hover:text-green-700"><CheckIcon className="w-3.5 h-3.5" /></button>
            <button onClick={() => set_editing(false)} className="text-txt-muted hover:text-txt-secondary"><XMarkIcon className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="text-xs text-txt-muted mt-0.5">{format_bytes(member.storage_used_bytes)} / {format_bytes(member.allocated_storage_bytes)}</div>
        )}
        <StorageBar used={member.storage_used_bytes} total={member.allocated_storage_bytes} />
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

// â”€â”€ Security tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Groups tab ────────────────────────────────────────────────────────────────
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
    try { const r = await list_org_groups(); if (r.data) set_groups(r.data); }
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

  const handle_delete = async (gid: string) => {
    try { await delete_org_group(gid); set_groups(p => p.filter(g => g.id !== gid)); if (expanded === gid) set_expanded(null); show_toast("Group deleted", "success"); }
    catch { show_toast("Failed to delete group", "error"); }
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
      <div className="flex items-center gap-2">
        <Input placeholder="Group name" value={new_name} onChange={e => set_new_name(e.target.value)} onKeyDown={e => e.key === "Enter" && handle_create()} className="flex-1" />
        <Input placeholder="Email prefix (optional)" value={new_email_prefix} onChange={e => set_new_email_prefix(e.target.value)} className="flex-1" />
        <button onClick={handle_create} disabled={creating || !new_name.trim()} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50 flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Create
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-txt-muted py-4">No groups yet.</p>
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
                    <span className="text-sm font-medium text-txt-primary truncate">{g.name}</span>
                    <span className="text-xs text-txt-muted flex-shrink-0">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                  </button>
                  <button onClick={() => handle_delete(g.id)} className="p-1.5 text-txt-muted hover:text-red-500 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
                </div>
                {is_open && (
                  <div className="pl-6 pb-3 space-y-1">
                    {gm.length === 0 ? <p className="text-xs text-txt-muted">No members yet.</p> : (
                      <div className="divide-y divide-edge-secondary">
                        {gm.map(m => (
                          <div key={m.user_id} className="flex items-center justify-between py-2">
                            <span className="text-sm text-txt-primary">{m.username}@{m.email_domain}</span>
                            <button onClick={() => handle_remove_member(g.id, m.user_id)} className="p-1 text-txt-muted hover:text-red-500"><XMarkIcon className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {adding_to === g.id ? (
                      <div className="flex items-center gap-2 pt-2">
                        <select value={add_user_id} onChange={e => set_add_user_id(e.target.value)} className="flex-1 text-sm border border-edge-secondary rounded px-2 py-1 bg-transparent text-txt-primary">
                          <option value="">Select member...</option>
                          {members.filter(m => !gm.some(x => x.user_id === m.user_id)).map(m => (
                            <option key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</option>
                          ))}
                        </select>
                        <button onClick={() => handle_add_member(g.id)} disabled={!add_user_id} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">Add</button>
                        <button onClick={() => { set_adding_to(null); set_add_user_id(""); }} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { set_adding_to(g.id); set_add_user_id(""); }} className="text-xs text-accent-blue hover:underline pt-1">Add member</button>
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

// ── Activity tab ────────────────────────────────────────────────────────────────
function ActivityContent() {
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");

  const load_page = useCallback(async (p: number) => {
    set_loading(true);
    try {
      const r = await get_activity_log(p, 20);
      if (r.data) {
        if (p === 1) set_entries(r.data.entries); else set_entries(prev => [...prev, ...r.data!.entries]);
        set_total(r.data.total); set_page(p);
      }
    } catch { show_toast("Failed to load activity", "error"); }
    finally { set_loading(false); }
  }, []);

  useEffect(() => { load_page(1); }, [load_page]);

  const unique_types = Array.from(new Set(entries.map(e => e.event_type)));
  const filtered = filter_type ? entries.filter(e => e.event_type === filter_type) : entries;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-txt-muted">{total} event{total !== 1 ? "s" : ""}</span>
        <select value={filter_type} onChange={e => set_filter_type(e.target.value)} className="text-sm border border-edge-secondary rounded px-2 py-1 bg-transparent text-txt-primary">
          <option value="">All events</option>
          {unique_types.map(type => <option key={type} value={type}>{EVENT_LABELS[type] ?? type}</option>)}
        </select>
      </div>
      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-txt-muted py-4">No activity yet.</p>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {filtered.map(entry => (
            <div key={entry.id} className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-txt-primary">{EVENT_LABELS[entry.event_type] ?? entry.event_type}</span>
                {entry.actor_username && <span className="text-xs text-txt-muted ml-2">by {entry.actor_username}</span>}
                {entry.target_username && <span className="text-xs text-txt-muted ml-1">&#8594; {entry.target_username}</span>}
              </div>
              <span className="text-xs text-txt-muted flex-shrink-0">{new Date(entry.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      {entries.length < total && (
        <button onClick={() => load_page(page + 1)} disabled={loading} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">
          {loading ? <Spinner size="sm" /> : "Load more"}
        </button>
      )}
    </div>
  );
}

// ── Filters tab ────────────────────────────────────────────────────────────────
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
    const r = await update_org_filter(f.id, { is_enabled: !f.is_enabled });
    if (r.data) set_filters(fs => fs.map(x => x.id === f.id ? r.data! : x));
  };
  const del_f = async (id: string) => { await delete_org_filter(id); set_filters(f => f.filter(x => x.id !== id)); show_toast("Filter deleted", "success"); };
  const fl = (v: string) => ({ from: "Sender", to: "Recipient", domain: "Domain", subject: "Subject" }[v] ?? v);
  const al = (v: string) => ({ trash: "Trash", block: "Block", archive: "Archive", mark_read: "Mark read" }[v] ?? v);

  if (loading) return <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-txt-muted">Filters apply to all family members' inboxes org-wide.</p>
        <button onClick={() => set_show_form(!show_form)} className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5">
          <PlusIcon className="w-3.5 h-3.5" /> New Filter
        </button>
      </div>
      {show_form && (
        <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Filter name" value={form.name} onChange={e => set_form(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Value (domain, email, keyword)" value={form.value} onChange={e => set_form(f => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <select value={form.field} onChange={e => set_form(f => ({ ...f, field: e.target.value }))} className="flex-1 text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
              <option value="from">Sender (from)</option><option value="to">Recipient (to)</option>
              <option value="domain">Domain</option><option value="subject">Subject</option>
            </select>
            <select value={form.action} onChange={e => set_form(f => ({ ...f, action: e.target.value }))} className="flex-1 text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
              <option value="trash">Move to Trash</option><option value="block">Block</option>
              <option value="archive">Archive</option><option value="mark_read">Mark as read</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={creating || !form.name.trim() || !form.value.trim()} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
              {creating ? <Spinner size="sm" /> : "Create Filter"}
            </button>
            <button onClick={() => set_show_form(false)} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
          </div>
        </div>
      )}
      {filters.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No org filters yet.</p>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {filters.map(f => (
            <div key={f.id} className="flex items-center gap-3 py-3">
              <button onClick={() => toggle_f(f)} className="flex-shrink-0">
                {f.is_enabled ? <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--accent-blue)" }} /> : <XCircleIcon className="w-5 h-5 text-txt-muted" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary">{f.name}</p>
                <p className="text-xs text-txt-muted">{fl(f.field)} = &ldquo;{f.value}&rdquo; &rarr; {al(f.action)}</p>
              </div>
              <button onClick={() => del_f(f.id)} className="p-1.5 text-txt-muted hover:text-red-500 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Domains tab ────────────────────────────────────────────────────────────────
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

  if (loading) return <div className="flex items-center gap-2 py-4"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Share custom domains so family members can create aliases on them.</p>
      {domains.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No custom domains found. Members can add domains in Aliases &amp; Domains settings.</p>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {domains.map(d => (
            <div key={d.domain_name} className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <GlobeAltIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                    <span className="text-sm font-medium text-txt-primary">{d.domain_name}</span>
                    {d.dkim_verified ? <span className="aster_badge aster_badge_green">Verified</span> : <span className="aster_badge aster_badge_amber">Unverified</span>}
                  </div>
                  <p className="text-xs text-txt-muted mt-0.5 ml-6">Owner: {d.owner_username} &middot; {d.shared_with_count} shared</p>
                </div>
                <button onClick={() => { set_sharing(d.domain_name); set_share_uid(""); }} className="aster_btn aster_btn_secondary aster_btn_sm flex-shrink-0">Share</button>
              </div>
              {sharing === d.domain_name && (
                <div className="flex gap-2 mt-3 ml-6">
                  <select value={share_uid} onChange={e => set_share_uid(e.target.value)} className="flex-1 text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
                    <option value="">Select member...</option>
                    {members.filter(m => m.user_id !== d.owner_user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</option>)}
                  </select>
                  <button onClick={() => do_share(d.domain_name)} disabled={!share_uid} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">Share</button>
                  <button onClick={() => set_sharing(null)} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
                </div>
              )}
            </div>
          ))}
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
    <div className="flex items-center gap-2 py-4">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span>
    </div>
  );

  const non_2fa = compliance.filter(m => !m.has_2fa).length;

  return (
    <div className="space-y-4">
      {non_2fa > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-white">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            {non_2fa} member{non_2fa !== 1 ? "s have" : " has"} not enabled 2FA
          </p>
        </div>
      )}
      <div className="divide-y divide-edge-secondary">
        {([
          { key: "require_2fa" as const, label: "Require two-factor authentication", hint: "All members must enable 2FA to access their accounts" },
          { key: "allow_imap_smtp" as const, label: "Allow IMAP/SMTP access", hint: "Members can connect third-party email clients via Aster Bridge" },
          { key: "block_external_forwarding" as const, label: "Block external forwarding", hint: "Prevent members from auto-forwarding mail outside the family" },
        ]).map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
            </div>
            <Switch
              checked={policy[key]}
              onCheckedChange={val => set_policy(p => p ? { ...p, [key]: val } : p)}
            />
          </div>
        ))}
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
                <div key={m.user_id} className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                    <p className="text-xs text-txt-muted">
                      {m.session_count} active session{m.session_count !== 1 ? "s" : ""}
                      {m.last_login && <span> &middot; last seen {new Date(m.last_login).toLocaleDateString()}</span>}
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

// â”€â”€ Retention tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    <div className="flex items-center gap-2 py-4">
      <Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Auto-purge old messages after a set number of days. Leave blank to keep forever.</p>
      <div className="divide-y divide-edge-secondary">
        {([
          { key: "trash_retention_days" as const, label: "Trash", hint: "Auto-delete trashed mail" },
          { key: "spam_retention_days" as const, label: "Spam", hint: "Auto-delete spam (default 30 days)" },
          { key: "sent_retention_days" as const, label: "Sent", hint: "Auto-delete sent mail" },
          { key: "all_mail_retention_days" as const, label: "All Mail", hint: "Hard limit on all messages" },
        ]).map(({ key, label, hint }) => (
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
        ))}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
            <p className="text-sm mt-0.5 text-txt-muted">Apply these policies to every account in this family</p>
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

// â”€â”€ Main section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [billing_history, set_billing_history] = useState<BillingHistoryItem[]>([]);
  const [billing_loading, set_billing_loading] = useState(false);

  const load_group = useCallback(async () => {
    try {
      const res = await get_family_group();
      if (res.data) {
        set_group(res.data);
        const active = res.data.members.filter(m => m.status === "active").length;
        const remaining_seats = Math.max(1, res.data.max_members - active);
        const used_alloc = res.data.members.reduce((s, m) => s + m.allocated_storage_bytes, 0);
        const remaining_bytes = res.data.storage_pool_bytes - used_alloc;
        set_invite_storage_gb(String(Math.max(1, Math.round(remaining_bytes / remaining_seats / 1073741824))));
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

  useEffect(() => {
    if (tab !== "overview" || !is_owner) return;
    if (billing_history.length > 0) return;
    set_billing_loading(true);
    get_billing_history(1, 3)
      .then(r => { if (r.data) set_billing_history(r.data.items || []); })
      .finally(() => set_billing_loading(false));
  }, [tab, is_owner, billing_history.length]);

  const handle_upgrade_to_family = async () => {
    set_changing_plan(true);
    try {
      const res = await change_plan("family", "year");
      if (res.ok) { show_toast(t("settings.change_plan"), "success"); window.location.reload(); }
      else show_toast(t("settings.failed_save_setting"), "error");
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_changing_plan(false); }
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

  const handle_change_plan = async (plan_code: string) => {
    set_changing_plan(true);
    try {
      const res = await change_plan(plan_code, "year");
      if (res.ok) { show_toast(t("settings.change_plan"), "success"); window.location.reload(); }
      else show_toast(t("settings.failed_save_setting"), "error");
    } catch { show_toast(t("settings.failed_save_setting"), "error"); }
    finally { set_changing_plan(false); }
  };

  if (!is_family_plan || loading) return null;

  if (!group) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">Family</h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        <div className="flex items-center gap-2 py-4">
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

  // Tabs: owners see Overview + management tabs; members just see Overview
  const owner_tabs: { id: FamilyTab; label: string; icon: React.ElementType }[] = is_owner ? [
    { id: "overview", label: "Overview", icon: UserGroupIcon },
    { id: "members", label: "Members", icon: UserPlusIcon },
    { id: "groups", label: "Groups", icon: UserGroupIcon },
    { id: "activity", label: "Activity", icon: ArrowsRightLeftIcon },
    { id: "filters", label: "Filters", icon: ShieldCheckIcon },
    { id: "domains", label: "Domains", icon: GlobeAltIcon },
    { id: "security", label: "Security", icon: ShieldCheckIcon },
    { id: "retention", label: "Retention", icon: ArchiveBoxIcon },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{group.plan_name}</h2>
        <p className="text-sm text-txt-secondary mt-0.5">
          {active_members.length} of {group.max_members} members &middot; {seats_remaining} seat{seats_remaining !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Single flat tab row - owners only */}
      {is_owner && (
        <div className="flex p-1 rounded-lg bg-surf-secondary overflow-x-auto scrollbar-none max-w-full">
          {owner_tabs.map(t_item => (
            <button
              key={t_item.id}
              onClick={() => set_tab(t_item.id)}
              className="relative px-3 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none whitespace-nowrap"
              style={{
                backgroundColor: tab === t_item.id ? "var(--bg-primary)" : "transparent",
                color: tab === t_item.id ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: tab === t_item.id ? "rgba(0,0,0,0.1) 0px 1px 3px,rgba(0,0,0,0.06) 0px 1px 2px" : "none",
              }}
            >
              {t_item.label}
            </button>
          ))}
        </div>
      )}

      {/* â”€â”€ Overview tab â”€â”€ */}
      {(tab === "overview" || !is_owner) && (
        <>
          {/* Storage */}
          <div>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
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
                  <div className={`h-1.5 rounded-full transition-all ${pool_pct >= 90 ? "bg-red-500" : pool_pct >= 70 ? "bg-amber-500" : "bg-accent-blue"}`}
                    style={{ width: `${pool_pct}%` }} />
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

          {/* Per member storage breakdown */}
          <div>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-txt-primary">Per member</h3>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <div className="space-y-2">
              {active_members.map(m => {
                const pct = storage_pct(m.storage_used_bytes, m.allocated_storage_bytes);
                const bar_color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent-blue";
                return (
                  <div key={m.user_id}>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white" style={{ backgroundColor: get_avatar_color(m.username) }}>
                        {m.username[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs text-txt-primary flex-1 min-w-0 truncate">{m.username}@{m.email_domain}</span>
                      <span className="text-xs text-txt-muted flex-shrink-0 w-28 text-right">{format_bytes(m.storage_used_bytes)} / {format_bytes(m.allocated_storage_bytes)}</span>
                    </div>
                    <div className="ml-9 w-full bg-edge-secondary h-1 rounded-full">
                      <div className={`${bar_color} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seat upgrade banner for Duo at capacity */}
          {is_owner && seats_full && group.plan_name === "Duo" && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-edge-secondary">
              <InformationCircleIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
              <p className="text-sm text-txt-secondary flex-1">All 2 seats used. Upgrade to Family plan for up to 6 members.</p>
              <button onClick={handle_upgrade_to_family} disabled={changing_plan} className="aster_btn aster_btn_primary aster_btn_sm flex-shrink-0 disabled:opacity-50">Upgrade</button>
            </div>
          )}

          {/* Change plan          {/* Change plan (owner only) */}
          {is_owner && (
            <div>
              <div className="mb-3">
                <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                  <ArrowsRightLeftIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                  Change plan
                </h3>
                <div className="mt-2 h-px bg-edge-secondary" />
              </div>
              <div className="py-2 space-y-3">
                <p className="text-xs text-txt-muted">Switch to a different plan. Your billing is prorated.</p>
                <div className="flex flex-wrap gap-2">
                  {group.plan_name === "Family" && (
                    <button onClick={() => handle_change_plan("duo")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Duo</button>
                  )}
                  <button onClick={() => handle_change_plan("supernova")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Supernova</button>
                  <button onClick={() => handle_change_plan("nova")} disabled={changing_plan} className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50">Switch to Nova</button>
                </div>
              </div>
            </div>
          )}

          {/* Billing history (owner only) */}
          {is_owner && (
            <div>
              <div className="mb-3">
                <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                  <ReceiptPercentIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                  Billing
                </h3>
                <div className="mt-2 h-px bg-edge-secondary" />
              </div>
              <div className="py-2 space-y-1">
                {billing_loading && <div className="flex items-center gap-2 py-2"><Spinner size="sm" /><span className="text-sm text-txt-muted">Loading...</span></div>}
                {!billing_loading && billing_history.length === 0 && <p className="text-sm text-txt-muted py-1">No billing history yet.</p>}
                {!billing_loading && billing_history.slice(0, 3).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-2">
                    <span className="text-xs text-txt-muted">{new Date(inv.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                    <span className="text-sm text-txt-primary flex-1 px-3">{format_price(inv.amount_cents, inv.currency)}</span>
                    <span className={inv.status === "paid" ? "aster_badge aster_badge_green" : "aster_badge aster_badge_amber"}>{inv.status}</span>
                  </div>
                ))}
                <button onClick={() => window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "billing" }))} className="text-xs text-accent-blue hover:underline pt-1">
                  View all billing
                </button>
              </div>
            </div>
          )}

          {/* Leave (non-owner) */}
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
              {active_members.filter(m => m.role === "owner").map(m => (
                <MemberRow key={m.user_id} member={m} is_owner_view={true}
                  on_remove={set_remove_target} on_transfer={set_transfer_target} on_reload={load_group} />
              ))}
              {active_members.filter(m => m.role !== "owner").length === 0 ? (
                <p className="text-sm text-txt-muted py-4">No other members yet.</p>
              ) : (
                active_members.filter(m => m.role !== "owner").map(m => (
                  <MemberRow key={m.user_id} member={m} is_owner_view={true}
                    on_remove={set_remove_target} on_transfer={set_transfer_target} on_reload={load_group} />
                ))
              )}
            </div>
          </div>

          {active_members.length < group.max_members && (
            <div>
              <div className="mt-1 h-px bg-edge-secondary mb-3" />
              {!show_invite_form ? (
                <button onClick={() => set_show_invite_form(true)} className="flex items-center gap-2 text-sm text-accent-blue hover:underline py-1">
                  <UserPlusIcon className="w-4 h-4" />
                  Add a member
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input type="email" placeholder={t("settings.family_invite_email_placeholder")} value={invite_email}
                      onChange={e => set_invite_email(e.target.value)} autoFocus className="flex-1" />
                    <div className="flex items-center gap-1">
                      <Input type="number" min="1" value={invite_storage_gb} onChange={e => set_invite_storage_gb(e.target.value)} className="w-20" />
                      <span className="text-sm text-txt-muted">GB</span>
                    </div>
                  </div>
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
                    <div>
                      <p className="text-sm text-txt-primary">{inv.link_only ? t("settings.family_invite_link") : t("settings.family_invite_by_email")}</p>
                      <p className="text-xs text-txt-muted">{t("settings.family_invite_expires", { date: new Date(inv.expires_at).toLocaleDateString() })}</p>
                    </div>
                    <button onClick={() => handle_revoke_invite(inv.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600">
                      {t("settings.family_invite_revoke")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

            {/* â”€â”€ Security tab â”€â”€ */}
      {tab === "groups"    && is_owner && <GroupsContent members={active_members} />}
      {tab === "activity"  && is_owner && <ActivityContent />}
      {tab === "filters"   && is_owner && <FiltersContent />}
      {tab === "domains"   && is_owner && <DomainsContent members={active_members} />}
      {tab === "security" && is_owner && <SecurityContent />}

      {/* â”€â”€ Retention tab â”€â”€ */}
      {tab === "retention" && is_owner && <RetentionContent />}

      {/* Confirmation dialogs */}
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
