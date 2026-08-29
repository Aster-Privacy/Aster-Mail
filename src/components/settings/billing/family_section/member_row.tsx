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
  UserGroupIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  PencilIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { SkeletonRows, StorageBar } from "./shared";

import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { type MemberComplianceInfo } from "@/services/api/family_org";
import {
  update_member_storage,
  type FamilyMemberInfo,
} from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";
import { format_bytes } from "@/lib/utils";
import { ignore_error } from "@/lib/ignore_error";

export function MemberRow({
  member,
  is_owner_view,
  compliance,
  pool_remaining_bytes,
  on_remove,
  on_transfer,
  on_reload,
}: {
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
    String(Math.round(member.allocated_storage_bytes / 1073741824)),
  );

  const min_gb = Math.max(1, Math.ceil(member.storage_used_bytes / 1073741824));
  const max_gb = Math.max(
    Math.round(
      (member.allocated_storage_bytes + (pool_remaining_bytes ?? 0)) /
        1073741824,
    ),
    Math.round(member.allocated_storage_bytes / 1073741824) + 1,
  );

  const storage_gb = Math.min(
    max_gb,
    Math.max(min_gb, Math.round(parseFloat(storage_input) || min_gb)),
  );

  const [saving_storage, set_saving_storage] = useState(false);
  const save_storage = useCallback(async () => {
    const clamped = storage_gb;

    set_storage_input(String(clamped));
    set_saving_storage(true);
    try {
      const r = await update_member_storage(
        member.user_id,
        Math.round(clamped * 1073741824),
      );

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      show_toast(t("settings.fam_org_member_storage_updated"), "success");
      set_editing(false);
      await on_reload();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_saving_storage(false);
    }
  }, [storage_gb, member.user_id, on_reload, t]);

  const badge_class =
    member.role === "owner"
      ? "aster_badge aster_badge_blue"
      : member.status === "grace"
        ? "aster_badge aster_badge_amber"
        : "aster_badge aster_badge_gray";
  const role_label =
    member.role === "owner"
      ? t("settings.family_member_owner")
      : member.status === "grace"
        ? t("settings.family_member_grace")
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
          <span className="text-sm font-medium text-txt-primary truncate">
            {member.username}@{member.email_domain}
          </span>
          <span className={badge_class}>{role_label}</span>
          {no_2fa && (
            <span className="aster_badge aster_badge_amber">
              {t("settings.fam_org_member_no_2fa")}
            </span>
          )}
          {compliance?.has_2fa && (
            <ShieldCheckIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Slider
                className="flex-1"
                max={max_gb}
                min={min_gb}
                value={storage_gb}
                onChange={(v) => set_storage_input(String(v))}
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  className="w-16 text-xs font-semibold text-end text-txt-primary bg-transparent border border-edge-secondary rounded px-1.5 py-0.5 focus:outline-none focus:border-accent-blue"
                  inputMode="numeric"
                  max={max_gb}
                  min={min_gb}
                  type="number"
                  value={storage_input}
                  onBlur={() => set_storage_input(String(storage_gb))}
                  onChange={(e) => set_storage_input(e.target.value)}
                />
                <span className="text-xs font-semibold text-txt-muted">
                  {t("settings.fam_org_gb")}
                </span>
              </div>
            </div>
            {pool_remaining_bytes !== undefined && (
              <p className="text-[10px] text-txt-muted">
                {t("settings.fam_org_member_pool_remaining", {
                  count: Math.max(
                    0,
                    Math.round(
                      (pool_remaining_bytes ?? 0) / 1073741824 -
                        (storage_gb -
                          member.allocated_storage_bytes / 1073741824),
                    ),
                  ),
                })}
              </p>
            )}
            <div className="flex gap-1">
              <button
                className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50 flex items-center gap-1"
                disabled={saving_storage}
                onClick={save_storage}
              >
                {saving_storage ? (
                  <Spinner size="sm" />
                ) : (
                  t("settings.fam_org_member_save")
                )}
              </button>
              <button
                className="aster_btn aster_btn_ghost aster_btn_sm"
                onClick={() => set_editing(false)}
              >
                {t("settings.fam_org_member_cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-txt-muted mt-0.5">
            {format_bytes(member.storage_used_bytes)} /{" "}
            {format_bytes(member.allocated_storage_bytes)}
          </div>
        )}
        {!editing && (
          <StorageBar
            total={member.allocated_storage_bytes}
            used={member.storage_used_bytes}
          />
        )}
      </div>
      {is_owner_view && !editing && (
        <div className="flex items-center gap-1 flex-shrink-0 self-center">
          <button
            aria-label={t("settings.family_storage_edit")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-txt-primary"
            title={t("settings.family_storage_edit")}
            onClick={() => set_editing(true)}
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          {member.role !== "owner" && (
            <>
              <button
                aria-label={t("settings.family_transfer_admin")}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent-blue"
                title={t("settings.family_transfer_admin")}
                onClick={() => on_transfer(member)}
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
              </button>
              <button
                aria-label={t("settings.family_remove_member")}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-red-500"
                title={t("settings.family_remove_member")}
                onClick={() => on_remove(member)}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberGroupsContent() {
  const { t } = use_i18n();
  const [my_groups, set_my_groups] = useState<
    import("@/services/api/family_org").MemberGroup[]
  >([]);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    import("@/services/api/family_org")
      .then((m) => m.list_my_groups())
      .then((r) => {
        if (r.data) set_my_groups(r.data);
        else
          show_toast(t("settings.fam_org_groups_members_load_failed"), "error");
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/billing/family_section/member_row:MemberGroupsContent",
          caught,
        ),
      )
      .finally(() => set_loading(false));
  }, []);

  if (loading) return <SkeletonRows count={2} has_icon={false} />;

  if (my_groups.length === 0)
    return (
      <div className="flex flex-col items-center py-10 gap-3">
        <UserGroupIcon className="w-12 h-12 text-txt-muted" />
        <p className="text-sm font-medium text-txt-primary">
          {t("settings.fam_org_member_groups_empty_title")}
        </p>
        <p className="text-xs text-txt-muted text-center max-w-xs">
          {t("settings.fam_org_member_groups_empty_desc")}
        </p>
      </div>
    );

  return (
    <div className="space-y-2">
      {my_groups.map((g) => (
        <div
          key={g.id}
          className="flex items-center gap-3 px-3 py-3 rounded-xl border border-edge-secondary"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-accent-blue/10 flex-shrink-0">
            <UserGroupIcon className="w-4 h-4 text-accent-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-txt-primary truncate">
              {g.name}
            </p>
            {g.email_local_part && g.domain_name && (
              <p className="text-xs font-mono text-txt-muted mt-0.5">
                {g.email_local_part}@{g.domain_name}
              </p>
            )}
          </div>
          {g.email_local_part && g.domain_name && (
            <span className="aster_badge aster_badge_blue shrink-0">
              {t("settings.fam_org_groups_has_email_title")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
