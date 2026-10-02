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
import { Input, Island, IslandEmpty, IslandRow, PillButton } from "@aster/ui";

import { SkeletonRows, StorageBar } from "./shared";
import { family_row_icon } from "./family_ui";

import { Slider } from "@/components/ui/slider";
import { ButtonSpinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { type MemberComplianceInfo } from "@/services/api/family_org";
import {
  update_member_storage,
  type FamilyMemberInfo,
} from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
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

  const icon_button =
    "flex h-9 w-9 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary";

  return (
    <div className="flex min-h-[68px] items-center gap-3.5 px-4 py-3">
      <ProfileAvatar
        email={`${member.username}@${member.email_domain}`}
        name={member.username}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[14.5px] font-medium text-txt-primary">
            {member.username}@{member.email_domain}
          </span>
          <span className={badge_class}>{role_label}</span>
          {no_2fa && (
            <span className="aster_badge aster_badge_amber">
              {t("settings.fam_org_member_no_2fa")}
            </span>
          )}
          {compliance?.has_2fa && (
            <ShieldCheckIcon
              aria-label={t("settings.fam_org_summary_all_2fa")}
              className="h-4 w-4 flex-shrink-0"
              style={{ color: "var(--color-success)" }}
            />
          )}
        </div>
        {editing ? (
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <Slider
                className="flex-1"
                max={max_gb}
                min={min_gb}
                value={storage_gb}
                onChange={(v) => set_storage_input(String(v))}
              />
              <div className="relative w-24 flex-shrink-0">
                <Input
                  className="aster_input_tonal pe-9 text-end font-semibold"
                  inputMode="numeric"
                  max={max_gb}
                  min={min_gb}
                  type="number"
                  value={storage_input}
                  onBlur={() => set_storage_input(String(storage_gb))}
                  onChange={(e) => set_storage_input(e.target.value)}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12.5px] text-txt-muted">
                  {t("settings.fam_org_gb")}
                </span>
              </div>
            </div>
            {pool_remaining_bytes !== undefined && (
              <p className="text-[12px] text-txt-muted">
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
            <div className="flex gap-2">
              <PillButton
                disabled={saving_storage}
                leading={saving_storage ? <ButtonSpinner /> : undefined}
                size="sm"
                type="button"
                variant="filled"
                onClick={save_storage}
              >
                {t("settings.fam_org_member_save")}
              </PillButton>
              <PillButton
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => set_editing(false)}
              >
                {t("settings.fam_org_member_cancel")}
              </PillButton>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-0.5 text-[12.5px] tabular-nums text-txt-muted">
              {format_bytes(member.storage_used_bytes)} /{" "}
              {format_bytes(member.allocated_storage_bytes)}
            </div>
            <StorageBar
              total={member.allocated_storage_bytes}
              used={member.storage_used_bytes}
            />
          </>
        )}
      </div>
      {is_owner_view && !editing && (
        <div className="flex flex-shrink-0 items-center gap-0.5 self-center">
          <button
            aria-label={t("settings.family_storage_edit")}
            className={icon_button}
            title={t("settings.family_storage_edit")}
            type="button"
            onClick={() => set_editing(true)}
          >
            <PencilIcon className="h-[18px] w-[18px]" />
          </button>
          {member.role !== "owner" && (
            <>
              <button
                aria-label={t("settings.family_transfer_admin")}
                className={icon_button}
                title={t("settings.family_transfer_admin")}
                type="button"
                onClick={() => on_transfer(member)}
              >
                <ArrowRightOnRectangleIcon className="h-[18px] w-[18px]" />
              </button>
              <button
                aria-label={t("settings.family_remove_member")}
                className={`${icon_button} hover:!text-[var(--color-danger)]`}
                title={t("settings.family_remove_member")}
                type="button"
                onClick={() => on_remove(member)}
              >
                <TrashIcon className="h-[18px] w-[18px]" />
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
  const [load_failed, set_load_failed] = useState(false);

  const load = useCallback(() => {
    set_loading(true);
    import("@/services/api/family_org")
      .then((m) => m.list_my_groups())
      .then((r) => {
        if (r.data) {
          set_my_groups(r.data);
          set_load_failed(false);
        } else {
          set_load_failed(true);
        }
      })
      .catch((caught) => {
        ignore_error(
          "components/settings/billing/family_section/member_row:MemberGroupsContent",
          caught,
        );
        set_load_failed(true);
      })
      .finally(() => set_loading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <SkeletonRows count={2} />;

  if (load_failed && my_groups.length === 0) {
    return <LoadFailedNotice on_retry={load} />;
  }

  if (my_groups.length === 0)
    return (
      <Island padding="lg">
        <IslandEmpty
          description={t("settings.fam_org_member_groups_empty_desc")}
          icon={<UserGroupIcon />}
          title={t("settings.fam_org_member_groups_empty_title")}
        />
      </Island>
    );

  return (
    <Island divided className="overflow-hidden" padding="none">
      {my_groups.map((g) => (
        <IslandRow
          key={g.id}
          description={
            g.email_local_part && g.domain_name
              ? `${g.email_local_part}@${g.domain_name}`
              : undefined
          }
          icon={family_row_icon(UserGroupIcon)}
          label={g.name}
          value={
            g.email_local_part && g.domain_name
              ? t("settings.fam_org_groups_has_email_title")
              : undefined
          }
        />
      ))}
    </Island>
  );
}
