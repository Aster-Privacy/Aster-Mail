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
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserPlusIcon,
  XMarkIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { get_avatar_color } from "@/lib/avatar_color";
import { format_bytes } from "@/lib/utils";
import type { FamilyGroupResponse, FamilyMemberInfo } from "@/services/api/family";
import {
  list_org_groups, create_org_group, delete_org_group,
  list_group_members, add_group_member, remove_group_member,
  get_activity_log,
  list_org_filters, create_org_filter, update_org_filter, delete_org_filter,
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  list_family_domains, share_domain, revoke_domain_share,
  get_member_compliance,
  type OrgGroup, type OrgGroupMember, type OrgFilter,
  type DataRetentionPolicy, type SecurityPolicy,
  type FamilyDomain, type MemberComplianceInfo,
  type ActivityLogEntry,
} from "@/services/api/family_org";

type AdminTab = "members" | "groups" | "domains" | "activity" | "filters" | "security" | "retention";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "groups", label: "Groups" },
  { id: "domains", label: "Domains" },
  { id: "activity", label: "Activity" },
  { id: "filters", label: "Filters" },
  { id: "security", label: "Security" },
  { id: "retention", label: "Retention" },
];

function tab_button(active: boolean, label: string, on_click: () => void) {
  return (
    <button
      key={label}
      className="relative px-4 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none whitespace-nowrap"
      style={{
        backgroundColor: active ? "var(--bg-primary)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        boxShadow: active ? "rgba(0,0,0,0.1) 0px 1px 3px, rgba(0,0,0,0.06) 0px 1px 2px" : "none",
      }}
      onClick={on_click}
    >
      {label}
    </button>
  );
}

interface Props {
  group: FamilyGroupResponse;
  members: FamilyMemberInfo[];
}

// ── Members ────────────────────────────────────────────────────────────────────
function MembersTab({ members, group }: { members: FamilyMemberInfo[]; group: FamilyGroupResponse }) {
  const active = members.filter(m => m.status === "active");
  return (
    <div className="space-y-3">
      <p className="text-xs text-txt-muted">{active.length} of {group.max_members} seats used</p>
      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {active.map(m => {
          const color = get_avatar_color(m.username);
          const pct = m.allocated_storage_bytes > 0 ? Math.min(100, (m.storage_used_bytes / m.allocated_storage_bytes) * 100) : 0;
          return (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                {m.username[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                <p className="text-xs text-txt-muted">{format_bytes(m.storage_used_bytes)} of {format_bytes(m.allocated_storage_bytes)}</p>
                <div className="w-full bg-edge-secondary rounded-full h-1 mt-1.5">
                  <div className={`h-1 rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent-blue"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className={`aster_badge flex-shrink-0 ${m.role === "owner" ? "aster_badge_blue" : "aster_badge_gray"}`}>
                {m.role === "owner" ? "Owner" : "Member"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Groups ─────────────────────────────────────────────────────────────────────
function GroupsTab({ family_members }: { family_members: FamilyMemberInfo[] }) {
  const [groups, set_groups] = useState<OrgGroup[]>([]);
  const [loading, set_loading] = useState(true);
  const [creating, set_creating] = useState(false);
  const [new_name, set_new_name] = useState("");
  const [new_local, set_new_local] = useState("");
  const [expanded, set_expanded] = useState<string | null>(null);
  const [group_members, set_group_members] = useState<Record<string, OrgGroupMember[]>>({});
  const [adding_to, set_adding_to] = useState<string | null>(null);
  const [add_user_id, set_add_user_id] = useState("");

  const load = useCallback(async () => {
    const r = await list_org_groups();
    if (r.data) set_groups(r.data);
    set_loading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const load_members = async (gid: string) => {
    const r = await list_group_members(gid);
    if (r.data) set_group_members(prev => ({ ...prev, [gid]: r.data! }));
  };

  const toggle_expand = async (gid: string) => {
    if (expanded === gid) { set_expanded(null); return; }
    set_expanded(gid);
    if (!group_members[gid]) await load_members(gid);
  };

  const create_group = async () => {
    if (!new_name.trim()) return;
    set_creating(true);
    try {
      const r = await create_org_group({ name: new_name.trim(), email_local_part: new_local || undefined });
      if (r.data) { set_groups(g => [...g, r.data!]); set_new_name(""); set_new_local(""); }
    } catch { show_toast("Failed to create group", "error"); }
    finally { set_creating(false); }
  };

  const delete_group = async (gid: string) => {
    await delete_org_group(gid);
    set_groups(g => g.filter(x => x.id !== gid));
    if (expanded === gid) set_expanded(null);
  };

  const add_member = async (gid: string) => {
    if (!add_user_id) return;
    try {
      await add_group_member(gid, add_user_id);
      await load_members(gid);
      set_groups(g => g.map(x => x.id === gid ? { ...x, member_count: x.member_count + 1 } : x));
      set_add_user_id("");
      set_adding_to(null);
    } catch { show_toast("Failed to add member", "error"); }
  };

  const remove_member = async (gid: string, uid: string) => {
    await remove_group_member(gid, uid);
    set_group_members(prev => ({ ...prev, [gid]: (prev[gid] || []).filter(m => m.user_id !== uid) }));
    set_groups(g => g.map(x => x.id === gid ? { ...x, member_count: Math.max(0, x.member_count - 1) } : x));
  };

  const available_to_add = (gid: string) => {
    const already = (group_members[gid] || []).map(m => m.user_id);
    return family_members.filter(m => !already.includes(m.user_id));
  };

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Distribution groups let you route email to multiple family members at once.</p>
      <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
        <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">New Group</p>
        <div className="flex gap-2">
          <Input placeholder="Group name" value={new_name} onChange={e => set_new_name(e.target.value)} className="flex-1" onKeyDown={e => e.key === "Enter" && create_group()} />
          <Input placeholder="email prefix (optional)" value={new_local} onChange={e => set_new_local(e.target.value)} className="w-44" />
          <button onClick={create_group} disabled={creating || !new_name.trim()} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
            <PlusIcon className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No groups yet. Create one above.</p>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => toggle_expand(g.id)} className="text-txt-muted hover:text-txt-primary">
                  {expanded === g.id ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle_expand(g.id)}>
                  <p className="text-sm font-medium text-txt-primary">{g.name}</p>
                  <p className="text-xs text-txt-muted">
                    {g.email_local_part && <span className="mr-2">{g.email_local_part}@family</span>}
                    {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button onClick={() => delete_group(g.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 flex-shrink-0">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>

              {expanded === g.id && (
                <div className="px-4 pb-3 space-y-2 border-t border-edge-secondary bg-surf-secondary">
                  {(group_members[g.id] || []).length === 0 ? (
                    <p className="text-xs text-txt-muted pt-2">No members in this group.</p>
                  ) : (
                    <div className="space-y-1 pt-2">
                      {(group_members[g.id] || []).map(m => {
                        const color = get_avatar_color(m.username);
                        return (
                          <div key={m.user_id} className="flex items-center gap-2 py-1">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                              {m.username[0]?.toUpperCase()}
                            </div>
                            <span className="text-xs text-txt-primary flex-1">{m.username}@{m.email_domain}</span>
                            <button onClick={() => remove_member(g.id, m.user_id)} className="text-txt-muted hover:text-red-500 flex-shrink-0">
                              <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {adding_to === g.id ? (
                    <div className="flex gap-2 pt-1">
                      <select
                        value={add_user_id}
                        onChange={e => set_add_user_id(e.target.value)}
                        className="flex-1 text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary"
                      >
                        <option value="">Select member...</option>
                        {available_to_add(g.id).map(m => (
                          <option key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</option>
                        ))}
                      </select>
                      <button onClick={() => add_member(g.id)} disabled={!add_user_id} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">Add</button>
                      <button onClick={() => { set_adding_to(null); set_add_user_id(""); }} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAndLoadAdding(g.id)} className="flex items-center gap-1.5 text-xs text-accent-blue hover:underline pt-1">
                      <UserPlusIcon className="w-3.5 h-3.5" /> Add member
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  function setAndLoadAdding(gid: string) {
    set_adding_to(gid);
    if (!group_members[gid]) load_members(gid);
  }
}

// ── Domains ────────────────────────────────────────────────────────────────────
function DomainsTab({ family_members }: { family_members: FamilyMemberInfo[] }) {
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [sharing, set_sharing] = useState<string | null>(null);
  const [share_uid, set_share_uid] = useState("");

  useEffect(() => {
    list_family_domains().then(r => { if (r.data) set_domains(r.data); set_loading(false); });
  }, []);

  const do_share = async (domain_name: string) => {
    if (!share_uid) return;
    try {
      await share_domain(domain_name, share_uid, true);
      set_domains(d => d.map(x => x.domain_name === domain_name ? { ...x, shared_with_count: x.shared_with_count + 1 } : x));
      set_sharing(null);
      set_share_uid("");
      show_toast("Domain shared", "success");
    } catch { show_toast("Failed to share domain", "error"); }
  };

  const do_revoke = async (domain_name: string, uid: string) => {
    try {
      await revoke_domain_share(domain_name, uid);
      set_domains(d => d.map(x => x.domain_name === domain_name ? { ...x, shared_with_count: Math.max(0, x.shared_with_count - 1) } : x));
      show_toast("Share revoked", "success");
    } catch { show_toast("Failed to revoke share", "error"); }
  };
  void do_revoke; // exposed for future per-member revoke UI

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  const members_not_owner = (owner_id: string) => family_members.filter(m => m.user_id !== owner_id);

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">
        Custom domains owned by family members. Share them so others can create aliases on those domains.
      </p>
      {domains.length === 0 ? (
        <div className="rounded-xl border border-edge-secondary p-6 text-center">
          <p className="text-sm text-txt-muted">No custom domains in your family.</p>
          <p className="text-xs text-txt-muted mt-1">Members can add custom domains in their Aliases &amp; Domains settings.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {domains.map(d => (
            <div key={d.domain_name} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-txt-primary">{d.domain_name}</p>
                    {d.dkim_verified
                      ? <span className="aster_badge aster_badge_green">Verified</span>
                      : <span className="aster_badge aster_badge_amber">Unverified</span>}
                  </div>
                  <p className="text-xs text-txt-muted mt-0.5">
                    Owned by {d.owner_username} &middot; Shared with {d.shared_with_count} member{d.shared_with_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => { set_sharing(d.domain_name); set_share_uid(""); }}
                  className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5 flex-shrink-0"
                >
                  <UserPlusIcon className="w-3.5 h-3.5" /> Share
                </button>
              </div>

              {sharing === d.domain_name && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={share_uid}
                    onChange={e => set_share_uid(e.target.value)}
                    className="flex-1 text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary"
                  >
                    <option value="">Select member to share with...</option>
                    {members_not_owner(d.owner_user_id).map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.username}@{m.email_domain}</option>
                    ))}
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

// ── Activity ───────────────────────────────────────────────────────────────────
const EVENT_LABELS: Record<string, string> = {
  member_joined: "Member joined",
  member_removed: "Member removed",
  member_left: "Member left",
  admin_transferred: "Admin transferred",
  group_created: "Group created",
  group_deleted: "Group deleted",
  group_member_added: "Added to group",
  group_member_removed: "Removed from group",
  filter_created: "Filter created",
  filter_deleted: "Filter deleted",
  domain_shared: "Domain shared",
  domain_share_revoked: "Domain share revoked",
  retention_updated: "Retention policy updated",
  security_policy_updated: "Security policy updated",
  invite_sent: "Invite sent",
  invite_revoked: "Invite revoked",
  storage_updated: "Storage updated",
};

function ActivityTab() {
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");

  const load = useCallback(async (p: number) => {
    set_loading(true);
    const r = await get_activity_log(p, 20);
    if (r.data) {
      if (p === 1) set_entries(r.data.entries);
      else set_entries(prev => [...prev, ...r.data!.entries]);
      set_total(r.data.total);
    }
    set_loading(false);
  }, []);

  useEffect(() => { load(1); }, [load]);

  const load_more = () => {
    const next = page + 1;
    set_page(next);
    load(next);
  };

  const visible = filter_type
    ? entries.filter(e => e.event_type === filter_type)
    : entries;

  const event_types = [...new Set(entries.map(e => e.event_type))];

  const fmt_date = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-txt-muted">{total} total events</p>
        {event_types.length > 0 && (
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-3.5 h-3.5 text-txt-muted" />
            <select
              value={filter_type}
              onChange={e => set_filter_type(e.target.value)}
              className="text-xs bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1 text-txt-primary"
            >
              <option value="">All events</option>
              {event_types.map(t => <option key={t} value={t}>{EVENT_LABELS[t] ?? t}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-sm text-txt-muted py-4">Loading...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-edge-secondary p-6 text-center">
          <p className="text-sm text-txt-muted">No activity recorded yet.</p>
          <p className="text-xs text-txt-muted mt-1">Actions taken on this family account will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {visible.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary">{EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g, " ")}</p>
                <p className="text-xs text-txt-muted mt-0.5">
                  {e.actor_username && <span>by <strong>{e.actor_username}</strong></span>}
                  {e.actor_username && e.target_username && <span> &rarr; </span>}
                  {e.target_username && <span><strong>{e.target_username}</strong></span>}
                </p>
              </div>
              <span className="text-xs text-txt-muted flex-shrink-0 mt-0.5">{fmt_date(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {entries.length < total && (
        <button onClick={load_more} disabled={loading} className="w-full text-sm text-accent-blue hover:underline disabled:opacity-50 py-2">
          {loading ? "Loading..." : `Load more (${total - entries.length} remaining)`}
        </button>
      )}
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────────
const FILTER_FIELDS = [
  { value: "from", label: "Sender (From)" },
  { value: "to", label: "Recipient (To)" },
  { value: "domain", label: "Domain" },
  { value: "subject", label: "Subject contains" },
];

const FILTER_ACTIONS = [
  { value: "trash", label: "Move to Trash" },
  { value: "block", label: "Block entirely" },
  { value: "archive", label: "Archive" },
  { value: "mark_read", label: "Mark as read" },
];

function FiltersTab() {
  const [filters, set_filters] = useState<OrgFilter[]>([]);
  const [loading, set_loading] = useState(true);
  const [creating, set_creating] = useState(false);
  const [show_form, set_show_form] = useState(false);
  const [form, set_form] = useState({ name: "", field: "from", value: "", action: "trash" });

  const load = useCallback(async () => {
    const r = await list_org_filters();
    if (r.data) set_filters(r.data);
    set_loading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.value.trim()) return;
    set_creating(true);
    try {
      const r = await create_org_filter({ name: form.name.trim(), filter_type: "block", field: form.field, value: form.value.trim(), action: form.action });
      if (r.data) {
        set_filters(f => [...f, r.data!]);
        set_form({ name: "", field: "from", value: "", action: "trash" });
        set_show_form(false);
      }
    } catch { show_toast("Failed to create filter", "error"); }
    finally { set_creating(false); }
  };

  const toggle = async (f: OrgFilter) => {
    const r = await update_org_filter(f.id, { is_enabled: !f.is_enabled });
    if (r.data) set_filters(fs => fs.map(x => x.id === f.id ? r.data! : x));
  };

  const remove = async (id: string) => {
    await delete_org_filter(id);
    set_filters(f => f.filter(x => x.id !== id));
  };

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  const action_label = (a: string) => FILTER_ACTIONS.find(x => x.value === a)?.label ?? a;
  const field_label = (f: string) => FILTER_FIELDS.find(x => x.value === f)?.label ?? f;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-txt-muted">Org-wide filters applied to all family members' inboxes.</p>
        <button onClick={() => set_show_form(!show_form)} className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> New Filter
        </button>
      </div>

      {show_form && (
        <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
          <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">New Filter</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-txt-muted block mb-1">Filter name</label>
              <Input placeholder="e.g. Block spam domain" value={form.name} onChange={e => set_form(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-txt-muted block mb-1">Value to match</label>
              <Input placeholder="e.g. spammy.com or keyword" value={form.value} onChange={e => set_form(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-txt-muted block mb-1">Match on</label>
              <select value={form.field} onChange={e => set_form(f => ({ ...f, field: e.target.value }))} className="w-full text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
                {FILTER_FIELDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-txt-muted block mb-1">Action</label>
              <select value={form.action} onChange={e => set_form(f => ({ ...f, action: e.target.value }))} className="w-full text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
                {FILTER_ACTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={creating || !form.name.trim() || !form.value.trim()} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
              {creating ? "Creating..." : "Create Filter"}
            </button>
            <button onClick={() => set_show_form(false)} className="aster_btn aster_btn_ghost aster_btn_sm">Cancel</button>
          </div>
        </div>
      )}

      {filters.length === 0 ? (
        <div className="rounded-xl border border-edge-secondary p-6 text-center">
          <p className="text-sm text-txt-muted">No org filters yet.</p>
          <p className="text-xs text-txt-muted mt-1">Filters apply to all family members' inboxes.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {filters.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggle(f)} className="flex-shrink-0" title={f.is_enabled ? "Disable filter" : "Enable filter"}>
                {f.is_enabled
                  ? <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--accent-blue)" }} />
                  : <XCircleIcon className="w-5 h-5 text-txt-muted" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary">{f.name}</p>
                <p className="text-xs text-txt-muted">
                  {field_label(f.field)} = &ldquo;{f.value}&rdquo; &rarr; {action_label(f.action)}
                </p>
              </div>
              {!f.is_enabled && <span className="aster_badge aster_badge_gray flex-shrink-0">Disabled</span>}
              <button onClick={() => remove(f.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 flex-shrink-0">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Security ───────────────────────────────────────────────────────────────────
function SecurityTab() {
  const [policy, set_policy] = useState<SecurityPolicy | null>(null);
  const [compliance, set_compliance] = useState<MemberComplianceInfo[]>([]);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    get_security_policy().then(r => { if (r.data) set_policy(r.data); });
    get_member_compliance().then(r => { if (r.data) set_compliance(r.data); });
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

  if (!policy) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  const non_2fa = compliance.filter(m => !m.has_2fa).length;

  return (
    <div className="space-y-4">
      {non_2fa > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {non_2fa} member{non_2fa !== 1 ? "s" : ""} {non_2fa !== 1 ? "have" : "has"} not enabled 2FA
          </p>
        </div>
      )}

      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {([
          { key: "require_2fa" as const, label: "Require two-factor authentication", hint: "All members must enable 2FA to access their accounts" },
          { key: "allow_imap_smtp" as const, label: "Allow IMAP/SMTP access", hint: "Members can connect third-party email clients via Aster Bridge" },
          { key: "block_external_forwarding" as const, label: "Block external forwarding", hint: "Prevent members from auto-forwarding mail to outside addresses" },
        ]).map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-xs text-txt-muted mt-0.5">{hint}</p>
            </div>
            <button
              onClick={() => set_policy(p => p ? { ...p, [key]: !p[key] } : p)}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${policy[key] ? "bg-accent-blue" : "bg-edge-secondary"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy[key] ? "translate-x-4" : ""}`} />
            </button>
          </div>
        ))}

        {policy.require_2fa && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-sm font-medium text-txt-primary">Grace period for new members</p>
              <p className="text-xs text-txt-muted mt-0.5">Days before 2FA is enforced after joining</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Input
                type="number"
                min="0"
                max="30"
                value={policy.require_2fa_grace_days}
                onChange={e => set_policy(p => p ? { ...p, require_2fa_grace_days: parseInt(e.target.value) || 0 } : p)}
                className="w-16"
              />
              <span className="text-xs text-txt-muted">days</span>
            </div>
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Security Policy"}
      </button>

      {compliance.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold text-txt-muted uppercase tracking-wide">Member Compliance</p>
          <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
            {compliance.map(m => {
              const color = get_avatar_color(m.username);
              return (
                <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                    <p className="text-xs text-txt-muted">
                      {m.session_count} active session{m.session_count !== 1 ? "s" : ""}
                      {m.last_login && <span> &middot; last login {new Date(m.last_login).toLocaleDateString()}</span>}
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

// ── Retention ──────────────────────────────────────────────────────────────────
function RetentionTab() {
  const [policy, set_policy] = useState<DataRetentionPolicy | null>(null);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    get_data_retention().then(r => { if (r.data) set_policy(r.data); });
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

  if (!policy) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">
        Auto-purge old messages after a set number of days. Leave blank to keep forever.
      </p>
      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {([
          { key: "trash_retention_days" as const, label: "Trash", hint: "Auto-delete trashed mail after N days" },
          { key: "spam_retention_days" as const, label: "Spam", hint: "Auto-delete spam (default 30 days)" },
          { key: "sent_retention_days" as const, label: "Sent", hint: "Auto-delete sent mail after N days" },
          { key: "all_mail_retention_days" as const, label: "All Mail", hint: "Hard limit - delete any mail older than N days" },
        ]).map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-xs text-txt-muted">{hint}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Input
                type="number"
                min="0"
                value={(policy[key] as number | null) ?? ""}
                onChange={e => set_policy(p => p ? { ...p, [key]: e.target.value ? parseInt(e.target.value) : null } : p)}
                className="w-20"
                placeholder="Off"
              />
              <span className="text-xs text-txt-muted">days</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-edge-secondary px-4 py-3">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
          <p className="text-xs text-txt-muted">Apply these policies to every account in this family</p>
        </div>
        <button
          onClick={() => set_policy(p => p ? { ...p, enforce_on_members: !p.enforce_on_members } : p)}
          className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${policy.enforce_on_members ? "bg-accent-blue" : "bg-edge-secondary"}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy.enforce_on_members ? "translate-x-4" : ""}`} />
        </button>
      </div>

      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Retention Policy"}
      </button>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────
export function FamilyOrgPanel({ group, members }: Props) {
  const [tab, set_tab] = useState<AdminTab>("members");
  const active_members = members.filter(m => m.status === "active");

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary flex-wrap gap-y-1">
        {TABS.map(t => tab_button(tab === t.id, t.label, () => set_tab(t.id)))}
      </div>

      {tab === "members"   && <MembersTab members={active_members} group={group} />}
      {tab === "groups"    && <GroupsTab family_members={active_members} />}
      {tab === "domains"   && <DomainsTab family_members={active_members} />}
      {tab === "activity"  && <ActivityTab />}
      {tab === "filters"   && <FiltersTab />}
      {tab === "security"  && <SecurityTab />}
      {tab === "retention" && <RetentionTab />}
    </div>
  );
}
