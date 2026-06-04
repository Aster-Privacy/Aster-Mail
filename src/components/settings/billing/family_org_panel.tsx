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
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { get_avatar_color } from "@/lib/avatar_color";
import { format_bytes } from "@/lib/utils";
import type { FamilyGroupResponse, FamilyMemberInfo } from "@/services/api/family";
import {
  list_org_groups, create_org_group, delete_org_group,
  get_activity_log, list_org_filters, create_org_filter, update_org_filter, delete_org_filter,
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  list_family_domains,
  get_member_compliance,
  type OrgGroup, type OrgFilter, type DataRetentionPolicy,
  type SecurityPolicy, type FamilyDomain, type MemberComplianceInfo,
  type ActivityLogEntry,
} from "@/services/api/family_org";

type OrgTab = "users" | "groups" | "domains" | "activity" | "filters" | "retention" | "security";

const TABS: { id: OrgTab; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "groups", label: "Groups" },
  { id: "domains", label: "Domains" },
  { id: "activity", label: "Activity" },
  { id: "filters", label: "Filters" },
  { id: "retention", label: "Retention" },
  { id: "security", label: "Security" },
];

function tab_btn(active: boolean, label: string, on_click: () => void) {
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

function event_label(type: string): string {
  const map: Record<string, string> = {
    member_joined: "Member joined", member_removed: "Member removed",
    member_left: "Member left", admin_transferred: "Admin transferred",
    group_created: "Group created", group_deleted: "Group deleted",
    group_member_added: "Added to group", group_member_removed: "Removed from group",
    filter_created: "Filter created", domain_shared: "Domain shared",
    retention_updated: "Retention policy updated", security_policy_updated: "Security policy updated",
    invite_sent: "Invite sent", invite_revoked: "Invite revoked",
    storage_updated: "Storage allocation updated",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

function UsersTab({ members, group }: { members: FamilyMemberInfo[]; group: FamilyGroupResponse }) {
  const active = members.filter(m => m.status === "active");
  return (
    <div className="space-y-3">
      <p className="text-xs text-txt-muted">{active.length} of {group.max_members} seats used</p>
      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {active.map(m => {
          const color = get_avatar_color(m.username);
          return (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                {m.username[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                <p className="text-xs text-txt-muted">{format_bytes(m.storage_used_bytes)} used of {format_bytes(m.allocated_storage_bytes)}</p>
              </div>
              <span className={`aster_badge ${m.role === "owner" ? "aster_badge_blue" : "aster_badge_gray"}`}>
                {m.role === "owner" ? "Owner" : "Member"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupsTab({ family_id: _ }: { family_id: string }) {
  const [groups, set_groups] = useState<OrgGroup[]>([]);
  const [new_name, set_new_name] = useState("");
  const [loading, set_loading] = useState(true);
  const [creating, set_creating] = useState(false);

  const load = useCallback(async () => {
    const res = await list_org_groups();
    if (res.data) set_groups(res.data);
    set_loading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!new_name.trim()) return;
    set_creating(true);
    try {
      const res = await create_org_group({ name: new_name.trim() });
      if (res.data) { set_groups(g => [...g, res.data!]); set_new_name(""); }
    } catch { show_toast("Failed to create group", "error"); }
    finally { set_creating(false); }
  };

  const remove = async (id: string) => {
    await delete_org_group(id);
    set_groups(g => g.filter(x => x.id !== id));
  };

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Create distribution groups to route email to multiple members at once.</p>
      <div className="flex gap-2">
        <Input placeholder="Group name" value={new_name} onChange={e => set_new_name(e.target.value)} className="flex-1" />
        <button onClick={create} disabled={creating || !new_name.trim()} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
          <PlusIcon className="w-4 h-4" /> Create
        </button>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No groups yet.</p>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {groups.map(g => (
            <div key={g.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-txt-primary">{g.name}</p>
                {g.email_local_part && g.domain_name && <p className="text-xs text-txt-muted">{g.email_local_part}@{g.domain_name}</p>}
                <p className="text-xs text-txt-muted">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => remove(g.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainsTab() {
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    list_family_domains().then(r => { if (r.data) set_domains(r.data); set_loading(false); });
  }, []);

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Custom domains owned by family members. Share them to let others create aliases.</p>
      {domains.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No custom domains. Members can add domains in Aliases &amp; Domains settings.</p>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {domains.map(d => (
            <div key={d.domain_name} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-txt-primary">{d.domain_name}</p>
                <p className="text-xs text-txt-muted">Owner: {d.owner_username} &middot; {d.shared_with_count} shared</p>
              </div>
              {d.dkim_verified ? <span className="aster_badge aster_badge_green">Verified</span> : <span className="aster_badge aster_badge_amber">Pending</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab() {
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    get_activity_log(1, 50).then(r => {
      if (r.data) { set_entries(r.data.entries); set_total(r.data.total); }
      set_loading(false);
    });
  }, []);

  if (loading) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-txt-muted">{total} events recorded</p>
      {entries.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">No activity recorded yet.</p>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-txt-primary">{event_label(e.event_type)}</p>
                <p className="text-xs text-txt-muted">
                  {e.actor_username && `by ${e.actor_username}`}
                  {e.target_username && ` · ${e.target_username}`}
                </p>
              </div>
              <span className="text-xs text-txt-muted flex-shrink-0">{new Date(e.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FiltersTab() {
  const [filters, set_filters] = useState<OrgFilter[]>([]);
  const [loading, set_loading] = useState(true);
  const [creating, set_creating] = useState(false);
  const [form, set_form] = useState({ name: "", field: "from", value: "", action: "trash", filter_type: "block" });

  const load = useCallback(async () => {
    const r = await list_org_filters(); if (r.data) set_filters(r.data); set_loading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.value.trim()) return;
    set_creating(true);
    try {
      const r = await create_org_filter({ ...form });
      if (r.data) { set_filters(f => [...f, r.data!]); set_form({ name: "", field: "from", value: "", action: "trash", filter_type: "block" }); }
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Filters applied to all members' inboxes org-wide.</p>
      <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
        <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">New Filter</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Filter name" value={form.name} onChange={e => set_form(f => ({ ...f, name: e.target.value }))} />
          <Input placeholder="Value (email, domain, subject)" value={form.value} onChange={e => set_form(f => ({ ...f, value: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <select value={form.field} onChange={e => set_form(f => ({ ...f, field: e.target.value }))} className="flex-1 text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
            <option value="from">Sender (from)</option>
            <option value="domain">Domain</option>
            <option value="subject">Subject</option>
            <option value="to">Recipient (to)</option>
          </select>
          <select value={form.action} onChange={e => set_form(f => ({ ...f, action: e.target.value }))} className="flex-1 text-sm bg-surf-tertiary border border-edge-secondary rounded-lg px-2 py-1.5 text-txt-primary">
            <option value="trash">Move to Trash</option>
            <option value="block">Block</option>
            <option value="archive">Archive</option>
          </select>
          <button onClick={create} disabled={creating || !form.name.trim() || !form.value.trim()} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
            <PlusIcon className="w-4 h-4" /> Add
          </button>
        </div>
      </div>
      {filters.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-4">No filters yet.</p>
      ) : (
        <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
          {filters.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => toggle(f)} className="flex-shrink-0">
                {f.is_enabled ? <CheckCircleIcon className="w-5 h-5 text-accent-blue" /> : <XCircleIcon className="w-5 h-5 text-txt-muted" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary">{f.name}</p>
                <p className="text-xs text-txt-muted">{f.field} contains "{f.value}" &rarr; {f.action}</p>
              </div>
              <button onClick={() => remove(f.id)} className="aster_btn aster_btn_ghost aster_btn_sm text-red-500">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const field = (label: string, key: keyof DataRetentionPolicy, hint: string) => (
    <div key={key} className="flex items-center justify-between py-3 border-b border-edge-secondary last:border-0">
      <div>
        <p className="text-sm font-medium text-txt-primary">{label}</p>
        <p className="text-xs text-txt-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input type="number" min="0" value={(policy[key] as number | null) ?? ""} onChange={e => set_policy(p => p ? { ...p, [key]: e.target.value ? parseInt(e.target.value) : null } : p)} className="w-20" placeholder="Off" />
        <span className="text-xs text-txt-muted">days</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">Automatically purge old messages. Leave blank to keep forever.</p>
      <div className="rounded-xl border border-edge-secondary px-4">
        {field("Trash", "trash_retention_days", "Auto-delete trashed mail")}
        {field("Spam", "spam_retention_days", "Auto-delete spam")}
        {field("Sent", "sent_retention_days", "Auto-delete sent mail")}
        {field("All Mail", "all_mail_retention_days", "Hard limit on all messages")}
      </div>
      <div className="flex items-center justify-between rounded-xl border border-edge-secondary px-4 py-3">
        <div>
          <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
          <p className="text-xs text-txt-muted">Apply these policies to every family account</p>
        </div>
        <button onClick={() => set_policy(p => p ? { ...p, enforce_on_members: !p.enforce_on_members } : p)} className={`w-10 h-6 rounded-full transition-colors ${policy.enforce_on_members ? "bg-accent-blue" : "bg-edge-secondary"}`}>
          <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy.enforce_on_members ? "translate-x-4" : ""}`} />
        </button>
      </div>
      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Retention Policy"}
      </button>
    </div>
  );
}

function SecurityTab(_: { members: FamilyMemberInfo[] }) {
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
          <p className="text-sm text-amber-700 dark:text-amber-300">{non_2fa} member{non_2fa !== 1 ? "s have" : " has"} not enabled 2FA</p>
        </div>
      )}
      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {[
          { key: "require_2fa" as const, label: "Require two-factor authentication", hint: "All members must enable 2FA" },
          { key: "allow_imap_smtp" as const, label: "Allow IMAP/SMTP access", hint: "Members can connect third-party email clients" },
          { key: "block_external_forwarding" as const, label: "Block external forwarding", hint: "Prevent auto-forwarding to external addresses" },
        ].map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-xs text-txt-muted">{hint}</p>
            </div>
            <button onClick={() => set_policy(p => p ? { ...p, [key]: !p[key] } : p)} className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${policy[key] ? "bg-accent-blue" : "bg-edge-secondary"}`}>
              <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy[key] ? "translate-x-4" : ""}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Security Policy"}
      </button>
      {compliance.length > 0 && (
        <div className="space-y-2">
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
                    <p className="text-xs text-txt-muted">{m.session_count} active session{m.session_count !== 1 ? "s" : ""}</p>
                  </div>
                  {m.has_2fa ? <span className="aster_badge aster_badge_green">2FA On</span> : <span className="aster_badge aster_badge_amber">No 2FA</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function FamilyOrgPanel({ group, members }: Props) {
  const [tab, set_tab] = useState<OrgTab>("users");

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary flex-wrap gap-y-1">
        {TABS.map(t => tab_btn(tab === t.id, t.label, () => set_tab(t.id)))}
      </div>

      <div>
        {tab === "users" && <UsersTab members={members} group={group} />}
        {tab === "groups" && <GroupsTab family_id={group.id} />}
        {tab === "domains" && <DomainsTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "filters" && <FiltersTab />}
        {tab === "retention" && <RetentionTab />}
        {tab === "security" && <SecurityTab members={members} />}
      </div>
    </div>
  );
}
