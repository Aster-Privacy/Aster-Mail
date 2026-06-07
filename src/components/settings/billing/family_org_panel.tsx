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
import {
  PencilIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { get_avatar_color } from "@/lib/avatar_color";
import { format_bytes } from "@/lib/utils";
import type { FamilyGroupResponse, FamilyMemberInfo } from "@/services/api/family";
import {
  update_member_storage,
  remove_family_member,
  transfer_family_admin,
} from "@/services/api/family";
import {
  get_data_retention, update_data_retention,
  get_security_policy, update_security_policy,
  get_member_compliance,
  type DataRetentionPolicy, type SecurityPolicy,
  type MemberComplianceInfo,
} from "@/services/api/family_org";
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

type AdminTab = "members" | "security" | "retention";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "security", label: "Security" },
  { id: "retention", label: "Retention" },
];

export interface FamilyOrgPanelProps {
  group: FamilyGroupResponse;
  members: FamilyMemberInfo[];
  on_reload: () => Promise<void>;
}

// ── Members tab ────────────────────────────────────────────────────────────────

interface AdminMemberRowProps {
  member: FamilyMemberInfo;
  on_remove: (m: FamilyMemberInfo) => void;
  on_transfer: (m: FamilyMemberInfo) => void;
  on_storage_saved: () => void;
}

function AdminMemberRow({ member, on_remove, on_transfer, on_storage_saved }: AdminMemberRowProps) {
  const [editing, set_editing] = useState(false);
  const [storage_input, set_storage_input] = useState(
    String(Math.round(member.allocated_storage_bytes / 1073741824))
  );
  const [saving, set_saving] = useState(false);

  const pct = member.allocated_storage_bytes > 0
    ? Math.min(100, (member.storage_used_bytes / member.allocated_storage_bytes) * 100)
    : 0;
  const bar_color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent-blue";
  const avatar_color = get_avatar_color(member.username);

  const save_storage = async () => {
    const gb = parseFloat(storage_input);
    if (isNaN(gb) || gb < 1) return;
    set_saving(true);
    try {
      await update_member_storage(member.user_id, Math.round(gb * 1073741824));
      show_toast("Storage updated", "success");
      set_editing(false);
      on_storage_saved();
    } catch {
      show_toast("Failed to update storage", "error");
    } finally {
      set_saving(false);
    }
  };

  const cancel_edit = () => {
    set_storage_input(String(Math.round(member.allocated_storage_bytes / 1073741824)));
    set_editing(false);
  };

  const badge_class = member.role === "owner"
    ? "aster_badge aster_badge_blue"
    : member.status === "grace"
    ? "aster_badge aster_badge_amber"
    : "aster_badge aster_badge_gray";

  const role_label = member.role === "owner" ? "Owner" : member.status === "grace" ? "Grace period" : "Member";

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold select-none"
        style={{ backgroundColor: avatar_color }}
      >
        {member.username[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-txt-primary truncate">
            {member.username}@{member.email_domain}
          </span>
          <span className={badge_class}>{role_label}</span>
        </div>

        {editing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="number"
              min="1"
              value={storage_input}
              onChange={(e) => set_storage_input(e.target.value)}
              className="w-16 text-xs border border-edge-secondary rounded px-1.5 py-0.5 bg-transparent text-txt-primary"
              autoFocus
            />
            <span className="text-xs text-txt-muted">GB</span>
            <button
              onClick={save_storage}
              disabled={saving}
              className="text-green-600 hover:text-green-700 disabled:opacity-50"
            >
              <CheckIcon className="w-3.5 h-3.5" />
            </button>
            <button onClick={cancel_edit} className="text-txt-muted hover:text-txt-secondary">
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-txt-muted mt-0.5">
            {format_bytes(member.storage_used_bytes)} / {format_bytes(member.allocated_storage_bytes)}
          </div>
        )}

        <div className="w-full bg-edge-secondary rounded-full h-1 mt-1.5">
          <div className={`${bar_color} h-1 rounded-full`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {member.role !== "owner" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {!editing && (
            <button
              onClick={() => set_editing(true)}
              className="p-1.5 text-txt-muted hover:text-txt-secondary"
              title="Edit storage"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => on_transfer(member)}
            className="p-1.5 text-txt-muted hover:text-accent-blue"
            title="Transfer admin"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => on_remove(member)}
            className="p-1.5 text-txt-muted hover:text-red-500"
            title="Remove member"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MembersTab({ members, group, on_reload }: { members: FamilyMemberInfo[]; group: FamilyGroupResponse; on_reload: () => Promise<void> }) {
  const active = members.filter(m => m.status !== "removed");
  const [remove_target, set_remove_target] = useState<FamilyMemberInfo | null>(null);
  const [transfer_target, set_transfer_target] = useState<FamilyMemberInfo | null>(null);
  const [action_loading, set_action_loading] = useState(false);

  const handle_remove = async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      await remove_family_member(remove_target.user_id);
      show_toast("Member removed", "success");
      await on_reload();
    } catch {
      show_toast("Failed to remove member", "error");
    } finally {
      set_action_loading(false);
      set_remove_target(null);
    }
  };

  const handle_transfer = async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      await transfer_family_admin(transfer_target.user_id);
      show_toast("Admin transferred", "success");
      await on_reload();
    } catch {
      show_toast("Failed to transfer admin", "error");
    } finally {
      set_action_loading(false);
      set_transfer_target(null);
    }
  };

  return (
    <>
      <p className="text-xs text-txt-muted mb-3">{active.length} of {group.max_members} seats used</p>

      <div className="divide-y divide-edge-secondary">
        {active.map(m => (
          <AdminMemberRow
            key={m.user_id}
            member={m}
            on_remove={set_remove_target}
            on_transfer={set_transfer_target}
            on_storage_saved={on_reload}
          />
        ))}
      </div>

      <AlertDialog open={!!remove_target} onOpenChange={(open) => !open && set_remove_target(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {remove_target?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {remove_target?.username} from the family plan. Their account will remain active but they will lose access to shared features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handle_remove} disabled={action_loading} className="aster_btn_destructive">
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!transfer_target} onOpenChange={(open) => !open && set_transfer_target(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer admin to {transfer_target?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will become a regular member. {transfer_target?.username} will become the new owner and administrator of this family plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handle_transfer} disabled={action_loading}>
              Transfer Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Security tab ───────────────────────────────────────────────────────────────

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
    } catch {
      show_toast("Failed to save security policy", "error");
    } finally {
      set_saving(false);
    }
  };

  if (!policy) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  const non_2fa = compliance.filter(m => !m.has_2fa).length;

  const toggle_rows = [
    { key: "require_2fa" as const, label: "Require two-factor authentication", hint: "All members must enable 2FA to access their accounts" },
    { key: "allow_imap_smtp" as const, label: "Allow IMAP/SMTP access", hint: "Members can connect third-party email clients via Aster Bridge" },
    { key: "block_external_forwarding" as const, label: "Block external forwarding", hint: "Prevent members from auto-forwarding mail to outside addresses" },
  ];

  return (
    <div className="space-y-4">
      {non_2fa > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {non_2fa} member{non_2fa !== 1 ? "s have" : " has"} not enabled 2FA
          </p>
        </div>
      )}

      <div className="divide-y divide-edge-secondary">
        {toggle_rows.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
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
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">Grace period for new members</p>
              <p className="text-sm mt-0.5 text-txt-muted">Days before 2FA is enforced after joining</p>
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
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary">Member Compliance</h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="divide-y divide-edge-secondary">
            {compliance.map(m => {
              const color = get_avatar_color(m.username);
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary truncate">{m.username}@{m.email_domain}</p>
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

// ── Retention tab ──────────────────────────────────────────────────────────────

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
    } catch {
      show_toast("Failed to save retention policy", "error");
    } finally {
      set_saving(false);
    }
  };

  if (!policy) return <p className="text-sm text-txt-muted py-4">Loading...</p>;

  const retention_rows = [
    { key: "trash_retention_days" as const, label: "Trash", hint: "Auto-delete trashed mail after N days" },
    { key: "spam_retention_days" as const, label: "Spam", hint: "Auto-delete spam after N days (default 30)" },
    { key: "sent_retention_days" as const, label: "Sent", hint: "Auto-delete sent mail after N days" },
    { key: "all_mail_retention_days" as const, label: "All Mail", hint: "Hard limit - delete any mail older than N days" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">
        Auto-purge old messages after a set number of days. Leave blank to keep forever.
      </p>

      <div className="divide-y divide-edge-secondary">
        {retention_rows.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">{label}</p>
              <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
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

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">Enforce on all members</p>
            <p className="text-sm mt-0.5 text-txt-muted">Apply these policies to every account in this family</p>
          </div>
          <button
            onClick={() => set_policy(p => p ? { ...p, enforce_on_members: !p.enforce_on_members } : p)}
            className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${policy.enforce_on_members ? "bg-accent-blue" : "bg-edge-secondary"}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${policy.enforce_on_members ? "translate-x-4" : ""}`} />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Retention Policy"}
      </button>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export function FamilyOrgPanel({ group, members, on_reload }: FamilyOrgPanelProps) {
  const [tab, set_tab] = useState<AdminTab>("members");
  const active_members = members.filter(m => m.status !== "removed");

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => set_tab(t.id)}
            className="relative px-5 py-2 text-sm font-medium rounded-[14px] transition-all duration-200 outline-none"
            style={{
              backgroundColor: tab === t.id ? "var(--bg-primary)" : "transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: tab === t.id ? "rgba(0,0,0,0.1) 0px 1px 3px, rgba(0,0,0,0.06) 0px 1px 2px" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members"   && <MembersTab members={active_members} group={group} on_reload={on_reload} />}
      {tab === "security"  && <SecurityTab />}
      {tab === "retention" && <RetentionTab />}
    </div>
  );
}
