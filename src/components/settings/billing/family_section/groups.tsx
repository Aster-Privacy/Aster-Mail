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
import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserGroupIcon,
  UsersIcon,
  TrashIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  PlusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  Island,
  IslandDivider,
  IslandEmpty,
  IslandRow,
  PillButton,
  Skeleton,
} from "@aster/ui";

import {
  FamilyCreateBar,
  FamilySkeletonRows,
  FamilyStatusText,
  family_row_icon,
} from "./family_ui";

import { apply_input_transform } from "@/utils/input_transform";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { ButtonSpinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  list_org_groups,
  create_org_group,
  delete_org_group,
  list_group_members,
  add_group_member,
  remove_group_member,
  type OrgGroup,
  type OrgGroupMember,
} from "@/services/api/family_org";
import { type FamilyMemberInfo } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { check_alias_availability } from "@/services/api/aliases";
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";
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
import { ignore_error } from "@/lib/ignore_error";
import { is_composing } from "@/utils/ime";

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
  const [group_members, set_group_members] = useState<
    Record<string, OrgGroupMember[]>
  >({});
  const [groups_load_failed, set_groups_load_failed] = useState(false);
  const [member_load_failed, set_member_load_failed] = useState<
    Record<string, boolean>
  >({});
  const [adding_to, set_adding_to] = useState<string | null>(null);
  const [add_user_id, set_add_user_id] = useState("");
  const [member_search, set_member_search] = useState("");

  const load_groups = useCallback(async () => {
    set_loading(true);
    set_groups_load_failed(false);
    try {
      const r = await list_org_groups();

      if (r.error || !r.data) {
        set_groups_load_failed(true);
        show_toast(t("settings.fam_org_groups_load_failed"), "error");
      } else {
        set_groups(r.data);
      }
    } catch {
      set_groups_load_failed(true);
      show_toast(t("settings.fam_org_groups_load_failed"), "error");
    } finally {
      set_loading(false);
    }
  }, [t]);

  useEffect(() => {
    load_groups();
    import("@/services/api/domains")
      .then((m) => m.list_domains())
      .then((r) => {
        const active_custom = (r.data?.domains ?? [])
          .filter((d) => d.status === "active" && !d.is_shared)
          .map((d) => d.domain_name)
          .filter((n) => n !== "astermail.org" && n !== "aster.cx");

        set_domains(["astermail.org", "aster.cx", ...active_custom]);
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/billing/family_section/groups:GroupsContent",
          caught,
        ),
      );
  }, [load_groups]);

  const load_members = async (gid: string) => {
    const mark_failed = () => {
      set_member_load_failed((p) => ({ ...p, [gid]: true }));
      show_toast(t("settings.fam_org_groups_members_load_failed"), "error");
    };

    set_member_load_failed((p) => ({ ...p, [gid]: false }));
    try {
      const r = await list_group_members(gid);

      if (r.data) set_group_members((p) => ({ ...p, [gid]: r.data! }));
      else mark_failed();
    } catch {
      mark_failed();
    }
  };

  const handle_expand = async (gid: string) => {
    if (expanded === gid) {
      set_expanded(null);

      return;
    }
    set_expanded(gid);
    if (!group_members[gid]) await load_members(gid);
  };

  const handle_create = async () => {
    if (!new_name.trim() || creating) return;
    set_creating(true);
    try {
      const payload: {
        name: string;
        email_local_part?: string;
        domain_name?: string;
      } = { name: new_name.trim() };

      if (new_email_prefix.trim() && new_domain) {
        const trimmed_prefix = new_email_prefix.trim().toLowerCase();
        const availability = await check_alias_availability(
          trimmed_prefix,
          new_domain,
        );

        if (!availability.data) {
          show_toast(t("common.something_went_wrong_try_again"), "error");
          set_creating(false);

          return;
        }
        if (!availability.data.available) {
          show_toast(t("settings.fam_org_groups_address_in_use"), "error");
          set_creating(false);

          return;
        }
        payload.email_local_part = trimmed_prefix;
        payload.domain_name = new_domain;
      }
      const r = await create_org_group(payload);

      if (r.data) {
        set_groups((p) => [...p, r.data!]);
        set_new_name("");
        set_new_email_prefix("");
        set_new_domain("astermail.org");
        show_toast(t("settings.fam_org_groups_created"), "success");
      } else if (r.code === "CONFLICT") {
        show_toast(t("settings.fam_org_groups_address_in_use"), "error");
      } else {
        show_toast(t("settings.fam_org_groups_create_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_org_groups_create_failed"), "error");
    } finally {
      set_creating(false);
    }
  };

  const [address_available, set_address_available] = useState<boolean | null>(
    null,
  );
  const availability_request_ref = useRef(0);

  useEffect(() => {
    if (!new_email_prefix || new_email_prefix.length < 2) {
      availability_request_ref.current += 1;
      set_address_available(null);

      return;
    }
    const timer = setTimeout(async () => {
      const request_id = ++availability_request_ref.current;

      try {
        const r = await check_alias_availability(new_email_prefix, new_domain);

        if (request_id !== availability_request_ref.current) return;
        set_address_available(r.data?.available ?? null);
      } catch {
        if (request_id !== availability_request_ref.current) return;
        set_address_available(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [new_email_prefix, new_domain]);

  const [confirm_delete_gid, set_confirm_delete_gid] = useState<string | null>(
    null,
  );

  const handle_delete = (gid: string) => {
    set_confirm_delete_gid(gid);
  };
  const confirm_delete = async () => {
    if (!confirm_delete_gid) return;
    try {
      const r = await delete_org_group(confirm_delete_gid);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");
      } else {
        set_groups((p) => p.filter((g) => g.id !== confirm_delete_gid));
        if (expanded === confirm_delete_gid) set_expanded(null);
        show_toast(t("settings.fam_org_groups_deleted"), "success");
      }
    } catch {
      show_toast(t("settings.fam_org_groups_delete_failed"), "error");
    } finally {
      set_confirm_delete_gid(null);
    }
  };

  const handle_remove_member = async (gid: string, uid: string) => {
    try {
      const r = await remove_group_member(gid, uid);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      set_group_members((p) => ({
        ...p,
        [gid]: (p[gid] ?? []).filter((m) => m.user_id !== uid),
      }));
      set_groups((p) =>
        p.map((g) =>
          g.id === gid ? { ...g, member_count: g.member_count - 1 } : g,
        ),
      );
      show_toast(t("settings.fam_org_groups_member_removed"), "success");
    } catch {
      show_toast(t("settings.fam_org_groups_remove_failed"), "error");
    }
  };

  const handle_add_member = async (gid: string) => {
    if (!add_user_id) return;
    const member = members.find((m) => m.user_id === add_user_id);

    if (!member) return;
    const optimistic: OrgGroupMember = {
      user_id: member.user_id,
      username: member.username,
      email_domain: member.email_domain,
      added_at: new Date().toISOString(),
    };

    set_group_members((p) => ({
      ...p,
      [gid]: [...(p[gid] ?? []), optimistic],
    }));
    set_groups((p) =>
      p.map((g) =>
        g.id === gid ? { ...g, member_count: g.member_count + 1 } : g,
      ),
    );
    set_adding_to(null);
    set_add_user_id("");
    set_member_search("");
    try {
      const r = await add_group_member(gid, add_user_id);

      if (r.error) {
        set_group_members((p) => ({
          ...p,
          [gid]: (p[gid] ?? []).filter((m) => m.user_id !== add_user_id),
        }));
        set_groups((p) =>
          p.map((g) =>
            g.id === gid
              ? { ...g, member_count: Math.max(0, g.member_count - 1) }
              : g,
          ),
        );
        show_toast(t("settings.fam_org_action_failed"), "error");
      } else {
        show_toast(t("settings.fam_org_groups_member_added"), "success");
      }
    } catch {
      set_group_members((p) => ({
        ...p,
        [gid]: (p[gid] ?? []).filter((m) => m.user_id !== add_user_id),
      }));
      set_groups((p) =>
        p.map((g) =>
          g.id === gid
            ? { ...g, member_count: Math.max(0, g.member_count - 1) }
            : g,
        ),
      );
      show_toast(t("settings.fam_org_groups_add_failed"), "error");
    }
  };

  const retry_groups = () => {
    void load_groups();
  };

  const open_add_picker = (gid: string) => {
    set_adding_to(gid);
    set_add_user_id("");
    set_member_search("");
  };

  const close_add_picker = () => {
    set_adding_to(null);
    set_add_user_id("");
    set_member_search("");
  };

  const address_status =
    address_available === true
      ? "success"
      : address_available === false
        ? "error"
        : "default";

  return (
    <div className="flex flex-col gap-4">
      <Island className="flex flex-col gap-3" padding="md">
        <FamilyCreateBar>
          <Input
            aria-label={t("settings.fam_org_groups_name_placeholder")}
            className="aster_input_tonal sm:flex-1"
            placeholder={t("settings.fam_org_groups_name_placeholder")}
            value={new_name}
            onChange={(e) => set_new_name(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !is_composing(e) && handle_create()
            }
          />
          <Input
            aria-label={t("settings.fam_org_groups_prefix_placeholder")}
            className="aster_input_tonal sm:flex-1"
            placeholder={t("settings.fam_org_groups_prefix_placeholder")}
            status={address_status}
            value={new_email_prefix}
            onChange={(e) => {
              set_new_email_prefix(
                apply_input_transform(e.target, (v) =>
                  v.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
                ),
              );
              set_address_available(null);
            }}
          />
          <Select value={new_domain} onValueChange={set_new_domain}>
            <SelectTrigger className="rounded-[var(--aster-radius-field)] sm:w-44">
              <span className="me-0.5 text-txt-muted">@</span>
              <SelectValue
                placeholder={t("settings.fam_org_groups_domain_placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PillButton
            className="flex-shrink-0"
            disabled={creating || !new_name.trim()}
            leading={
              creating ? <ButtonSpinner /> : <PlusIcon className="h-4 w-4" />
            }
            variant="filled"
            onClick={handle_create}
          >
            {t("settings.fam_org_groups_create")}
          </PillButton>
        </FamilyCreateBar>
        <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 text-txt-muted">
          <InfoPopover
            description={t("settings.fam_org_groups_info_desc")}
            title={t("settings.fam_org_groups_info_title")}
          />
          {new_email_prefix.trim() ? (
            <span className="min-w-0 truncate">
              {t("settings.fam_org_groups_address_preview")}
              <span className="font-medium text-txt-primary">
                {new_email_prefix.trim()}@{new_domain}
              </span>
            </span>
          ) : (
            <span className="min-w-0">
              {t("settings.fam_org_groups_prefix_hint")}
            </span>
          )}
          {address_available !== null && new_email_prefix.trim() && (
            <span className="ms-auto flex-shrink-0 text-[12.5px]">
              <FamilyStatusText tone={address_available ? "success" : "danger"}>
                {address_available
                  ? t("settings.fam_kids_available")
                  : t("settings.fam_kids_taken")}
              </FamilyStatusText>
            </span>
          )}
        </div>
      </Island>

      {loading && groups.length === 0 ? (
        <FamilySkeletonRows count={3} />
      ) : groups_load_failed && groups.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            action={
              <PillButton size="sm" variant="tonal" onClick={retry_groups}>
                {t("common.retry")}
              </PillButton>
            }
            description={t("common.something_went_wrong_try_again")}
            icon={<ExclamationTriangleIcon />}
            title={t("settings.fam_org_groups_load_failed")}
          />
        </Island>
      ) : groups.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            description={t("settings.fam_org_groups_empty_desc")}
            icon={<UserGroupIcon />}
            title={t("settings.fam_org_groups_empty_title")}
          />
        </Island>
      ) : (
        <Island className="overflow-hidden" padding="none">
          {groups.map((g, index) => {
            const is_open = expanded === g.id;
            const gm = group_members[g.id] ?? [];
            const members_failed = !!member_load_failed[g.id];
            const loading_members =
              is_open && !group_members[g.id] && !members_failed;
            const available_members = members.filter(
              (m) =>
                !gm.some((x) => x.user_id === m.user_id) &&
                (!member_search ||
                  `${m.username}@${m.email_domain}`
                    .toLowerCase()
                    .includes(member_search.toLowerCase())),
            );

            return (
              <div key={g.id}>
                {index > 0 && <IslandDivider />}
                <IslandRow
                  aria-expanded={is_open}
                  chevron={false}
                  description={
                    g.email_local_part
                      ? `${g.email_local_part}${
                          g.domain_name
                            ? `@${g.domain_name}`
                            : t("settings.fam_org_groups_default_domain")
                        }`
                      : undefined
                  }
                  icon={family_row_icon(UserGroupIcon)}
                  label={g.name}
                  on_press={() => void handle_expand(g.id)}
                  trailing={
                    <span className="flex items-center gap-2.5">
                      <span className="text-[13px] tabular-nums text-txt-muted">
                        {g.member_count}
                      </span>
                      <ChevronRightIcon
                        className={`h-4 w-4 text-txt-muted transition-transform duration-200 rtl:-scale-x-100 ${is_open ? "rotate-90" : ""}`}
                      />
                    </span>
                  }
                />

                {is_open && (
                  <>
                    <IslandDivider />
                    {loading_members ? (
                      <div aria-busy="true" className="flex flex-col">
                        {[0, 1].map((i) => (
                          <div
                            key={i}
                            className="flex min-h-[56px] items-center gap-3.5 px-4 py-3"
                          >
                            <Skeleton
                              className="flex-shrink-0"
                              height={24}
                              variant="circular"
                              width={24}
                            />
                            <Skeleton height={12} width={`${40 + i * 14}%`} />
                          </div>
                        ))}
                      </div>
                    ) : members_failed && !group_members[g.id] ? (
                      <IslandEmpty
                        action={
                          <PillButton
                            size="sm"
                            variant="tonal"
                            onClick={() => void load_members(g.id)}
                          >
                            {t("common.retry")}
                          </PillButton>
                        }
                        description={t("common.something_went_wrong_try_again")}
                        icon={<ExclamationTriangleIcon />}
                        title={t("settings.fam_org_groups_members_load_failed")}
                      />
                    ) : gm.length === 0 && adding_to !== g.id ? (
                      <IslandEmpty
                        action={
                          <PillButton
                            leading={<PlusIcon className="h-4 w-4" />}
                            size="sm"
                            variant="tonal"
                            onClick={() => open_add_picker(g.id)}
                          >
                            {t("settings.fam_org_groups_add_member")}
                          </PillButton>
                        }
                        icon={<UsersIcon />}
                        title={t("settings.fam_org_groups_no_members")}
                      />
                    ) : (
                      gm.map((m, member_index) => (
                        <div key={m.user_id}>
                          {member_index > 0 && <IslandDivider />}
                          <IslandRow
                            icon={
                              <ProfileAvatar
                                email={`${m.username}@${m.email_domain}`}
                                name={m.username}
                                size="xs"
                              />
                            }
                            label={`${m.username}@${m.email_domain}`}
                            trailing={
                              <PillButton
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handle_remove_member(g.id, m.user_id)
                                }
                              >
                                {t("settings.fam_org_groups_remove")}
                              </PillButton>
                            }
                          />
                        </div>
                      ))
                    )}

                    {adding_to === g.id ? (
                      <>
                        {gm.length > 0 && <IslandDivider />}
                        <div className="flex flex-col gap-3 px-4 py-3">
                          <Input
                            autoFocus
                            aria-label={t(
                              "settings.fam_org_groups_search_placeholder",
                            )}
                            className="aster_input_tonal"
                            placeholder={t(
                              "settings.fam_org_groups_search_placeholder",
                            )}
                            value={member_search}
                            onChange={(e) => set_member_search(e.target.value)}
                          />
                          <div
                            className="max-h-52 overflow-y-auto rounded-[var(--aster-radius-field)]"
                            style={{
                              backgroundColor:
                                "color-mix(in srgb, var(--text-primary) 4%, transparent)",
                            }}
                          >
                            {available_members.length === 0 ? (
                              <p className="px-4 py-4 text-center text-[13px] text-txt-muted">
                                {t("settings.fam_org_groups_no_available")}
                              </p>
                            ) : (
                              available_members.map((m) => {
                                const is_selected = add_user_id === m.user_id;

                                return (
                                  <button
                                    key={m.user_id}
                                    aria-pressed={is_selected}
                                    className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-[var(--aster-hover)]"
                                    type="button"
                                    onClick={() =>
                                      set_add_user_id((prev) =>
                                        prev === m.user_id ? "" : m.user_id,
                                      )
                                    }
                                  >
                                    <ProfileAvatar
                                      email={`${m.username}@${m.email_domain}`}
                                      name={m.username}
                                      size="xs"
                                    />
                                    <span className="min-w-0 flex-1 truncate text-[14px] text-txt-primary">
                                      {m.username}@{m.email_domain}
                                    </span>
                                    {is_selected && (
                                      <CheckCircleIcon
                                        className="h-5 w-5 flex-shrink-0"
                                        style={{ color: "var(--accent-color)" }}
                                      />
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <PillButton
                              disabled={!add_user_id}
                              leading={<PlusIcon className="h-4 w-4" />}
                              variant="filled"
                              onClick={() => handle_add_member(g.id)}
                            >
                              {t("settings.fam_org_groups_add")}
                            </PillButton>
                            <PillButton
                              variant="ghost"
                              onClick={close_add_picker}
                            >
                              {t("settings.fam_org_groups_cancel")}
                            </PillButton>
                          </div>
                        </div>
                      </>
                    ) : (
                      gm.length > 0 && (
                        <>
                          <IslandDivider />
                          <IslandRow
                            chevron={false}
                            icon={family_row_icon(PlusIcon)}
                            label={t("settings.fam_org_groups_add_member")}
                            on_press={() => open_add_picker(g.id)}
                          />
                        </>
                      )
                    )}

                    <IslandDivider />
                    <IslandRow
                      destructive
                      chevron={false}
                      icon={family_row_icon(TrashIcon)}
                      label={t("settings.fam_org_groups_delete")}
                      on_press={() => handle_delete(g.id)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </Island>
      )}

      <AlertDialog
        open={!!confirm_delete_gid}
        onOpenChange={(open) => !open && set_confirm_delete_gid(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.fam_org_groups_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.fam_org_groups_delete_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.fam_org_groups_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive"
              onClick={confirm_delete}
            >
              {t("settings.fam_org_groups_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
