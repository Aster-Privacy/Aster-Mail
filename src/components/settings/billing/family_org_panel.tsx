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
import { useState, useEffect } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { show_toast } from "@/components/toast/simple_toast";
import { get_avatar_color } from "@/lib/avatar_color";
import { format_bytes } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { FamilyGroupResponse, FamilyMemberInfo } from "@/services/api/family";
import {
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  get_member_compliance,
  type DataRetentionPolicy, type SecurityPolicy, type MemberComplianceInfo,
} from "@/services/api/family_org";

type AdminTab = "members" | "security" | "retention";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "security", label: "Security" },
  { id: "retention", label: "Retention" },
];

function tab_button(active: boolean, label: string, on_click: () => void) {
  return (
    <button
      key={label}
      className="relative px-5 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none"
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

function MembersTab({ members, group }: { members: FamilyMemberInfo[]; group: FamilyGroupResponse }) {
  const active = members.filter(m => m.status === "active");
  return (
    <div className="space-y-3">
      <p className="text-xs text-txt-muted">{active.length} of {group.max_members} seats used</p>
      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {active.map(m => {
          const color = get_avatar_color(m.username);
          return (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {m.username[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">
                  {m.username}@{m.email_domain}
                </p>
                <p className="text-xs text-txt-muted">
                  {format_bytes(m.storage_used_bytes)} used of {format_bytes(m.allocated_storage_bytes)}
                </p>
                <div className="w-full bg-edge-secondary rounded-full h-1 mt-1.5">
                  <div
                    className="h-1 rounded-full bg-accent-blue"
                    style={{ width: `${Math.min(100, (m.storage_used_bytes / m.allocated_storage_bytes) * 100)}%` }}
                  />
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
            <div>
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-xs text-txt-muted mt-0.5">{hint}</p>
            </div>
            <button
              onClick={() => set_policy(p => p ? { ...p, [key]: !p[key] } : p)}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${policy[key] ? "bg-accent-blue" : "bg-edge-secondary"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy[key] ? "translate-x-4" : ""}`} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50"
      >
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
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary truncate">{m.username}@{m.email_domain}</p>
                    <p className="text-xs text-txt-muted">{m.session_count} active session{m.session_count !== 1 ? "s" : ""}</p>
                  </div>
                  {m.has_2fa
                    ? <span className="aster_badge aster_badge_green">2FA On</span>
                    : <span className="aster_badge aster_badge_amber">No 2FA</span>
                  }
                </div>
              );
            })}
          </div>
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">
        Auto-purge old messages after a set number of days. Leave blank to keep forever.
      </p>

      <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
        {([
          { key: "trash_retention_days" as const, label: "Trash", hint: "Auto-delete trashed mail" },
          { key: "spam_retention_days" as const, label: "Spam", hint: "Auto-delete spam (default 30 days)" },
          { key: "sent_retention_days" as const, label: "Sent", hint: "Auto-delete sent mail" },
          { key: "all_mail_retention_days" as const, label: "All Mail", hint: "Hard limit on all messages" },
        ]).map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-xs text-txt-muted">{hint}</p>
            </div>
            <div className="flex items-center gap-2">
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
        <div>
          <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
          <p className="text-xs text-txt-muted">Apply these policies to every family account</p>
        </div>
        <button
          onClick={() => set_policy(p => p ? { ...p, enforce_on_members: !p.enforce_on_members } : p)}
          className={`w-10 h-6 rounded-full transition-colors ml-4 ${policy.enforce_on_members ? "bg-accent-blue" : "bg-edge-secondary"}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy.enforce_on_members ? "translate-x-4" : ""}`} />
        </button>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Retention Policy"}
      </button>
    </div>
  );
}

export function FamilyOrgPanel({ group, members }: Props) {
  const [tab, set_tab] = useState<AdminTab>("members");

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
        {TABS.map(t => tab_button(tab === t.id, t.label, () => set_tab(t.id)))}
      </div>

      {tab === "members" && <MembersTab members={members} group={group} />}
      {tab === "security" && <SecurityTab />}
      {tab === "retention" && <RetentionTab />}
    </div>
  );
}
