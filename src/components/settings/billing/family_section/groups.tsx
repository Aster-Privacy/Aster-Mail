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
import { useState, useEffect, useCallback,  } from "react";
import {
  
  UserGroupIcon,
  
  
  TrashIcon,
  
  
  
  
  
  
  
  
  CheckCircleIcon,
  
  ChevronRightIcon,
  PlusIcon,
  
  
  
  
  
  
  
} from "@heroicons/react/24/outline";
import { } from "@/components/settings/billing/shared_mailboxes_tab";
import { Input } from "@/components/ui/input";
import { } from "@/components/ui/slider";
import { InfoPopover } from "@/components/ui/info_popover";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {  Button } from "@aster/ui";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { } from "@/services/api/billing";
import {
  list_org_groups, create_org_group, delete_org_group,
  list_group_members, add_group_member, remove_group_member,
  
     
    
   
   
   
    
  type OrgGroup, type OrgGroupMember,  
    
    
} from "@/services/api/family_org";
import {
  
  
  
  
  
  
  
  
  
  type FamilyMemberInfo,
} from "@/services/api/family";
import { } from "../family_seats";
import { } from "../family_kids_addresses";
import { } from "@/components/settings/settings_tab_bar";
import { } from "@/components/settings/stat_ring";
import { show_toast } from "@/components/toast/simple_toast";
import { check_alias_availability } from "@/services/api/aliases";
import { use_i18n } from "@/lib/i18n/context";
import { } from "@/contexts/preferences_context";
import type { } from "@/lib/i18n/types";
import { } from "@/lib/utils";
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

import { SkeletonRows } from "./shared";
export function GroupsContent({ members }: { members: FamilyMemberInfo[] }) {
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

