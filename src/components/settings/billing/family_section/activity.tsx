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
import type { ComponentType, SVGProps } from "react";

import { Island, IslandEmpty, IslandRow, PillButton } from "@aster/ui";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserPlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  PlusIcon,
  GlobeAltIcon,
  ChartBarIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import {
  activity_event_text,
  event_labels,
  format_activity_time,
  last_seen_relative,
} from "./helpers";
import {
  FamilyCreateBar,
  FamilySkeletonRows,
  family_row_icon,
} from "./family_ui";
import { FamilyLoadFailed } from "./filters";

import { Input } from "@/components/ui/input";
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
  get_activity_log,
  type ActivityLogEntry,
} from "@/services/api/family_org";
import { type FamilyMemberInfo } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";

function activity_event_icon(
  event_type: string,
): ComponentType<SVGProps<SVGSVGElement>> {
  if (["member_joined", "invite_sent"].includes(event_type))
    return UserPlusIcon;
  if (
    ["member_removed", "invite_revoked", "group_deleted"].includes(event_type)
  )
    return TrashIcon;
  if (["admin_transferred", "storage_updated"].includes(event_type))
    return ArrowsRightLeftIcon;
  if (["security_policy_updated", "security_notify_sent"].includes(event_type))
    return ShieldCheckIcon;
  if (event_type === "retention_updated") return ArchiveBoxIcon;
  if (event_type === "domain_shared") return GlobeAltIcon;

  return PlusIcon;
}

export function ActivityContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");
  const [search, set_search] = useState("");
  const [load_failed, set_load_failed] = useState(false);

  const load_page = useCallback(
    async (p: number, ft?: string) => {
      set_loading(true);
      set_load_failed(false);
      try {
        const r = await get_activity_log(p, 20, ft);

        if (r.data) {
          if (p === 1) set_entries(r.data.entries);
          else set_entries((prev) => [...prev, ...r.data!.entries]);
          set_total(r.data.total);
          set_page(p);
        } else {
          set_load_failed(true);
          show_toast(t("settings.fam_org_action_failed"), "error");
        }
      } catch {
        set_load_failed(true);
        show_toast(t("settings.fam_org_activity_load_failed"), "error");
      } finally {
        set_loading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    load_page(1, filter_type || undefined);
  }, [load_page, filter_type]);

  const filtered_entries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();

    return entries.filter(
      (e) =>
        (e.actor_username ?? "").toLowerCase().includes(q) ||
        (e.target_username ?? "").toLowerCase().includes(q) ||
        (event_labels(t)[e.event_type] ?? e.event_type)
          .toLowerCase()
          .includes(q),
    );
  }, [entries, search, t]);

  const initial_loading = loading && entries.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <FamilyCreateBar>
        <Input
          aria-label={t("settings.fam_org_activity_search_placeholder")}
          className="aster_input_tonal sm:flex-1"
          placeholder={t("settings.fam_org_activity_search_placeholder")}
          value={search}
          onChange={(e) => set_search(e.target.value)}
        />
        <Select
          value={filter_type || "all"}
          onValueChange={(v) => set_filter_type(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-10 w-full rounded-[var(--aster-radius-field)] sm:w-52">
            <SelectValue
              placeholder={t("settings.fam_org_activity_all_events")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings.fam_org_activity_all_events")}
            </SelectItem>
            {Object.entries(event_labels(t)).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FamilyCreateBar>

      {initial_loading ? (
        <FamilySkeletonRows count={4} />
      ) : entries.length === 0 && load_failed ? (
        <FamilyLoadFailed
          on_retry={() => void load_page(1, filter_type || undefined)}
        />
      ) : entries.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            description={t("settings.fam_org_activity_empty_desc")}
            icon={<ChartBarIcon />}
            title={t("settings.fam_org_activity_empty_title")}
          />
          <div className="mx-auto mt-1 grid w-fit grid-cols-2 gap-x-5 gap-y-1.5 text-start">
            {[
              t("settings.fam_org_activity_cat_member_joins"),
              t("settings.fam_org_activity_cat_security_changes"),
              t("settings.fam_org_activity_cat_filter_updates"),
              t("settings.fam_org_activity_cat_domain_sharing"),
              t("settings.fam_org_activity_cat_storage_changes"),
              t("settings.fam_org_activity_cat_invite_activity"),
            ].map((e) => (
              <div
                key={e}
                className="flex items-center gap-2 text-[12.5px] text-txt-muted"
              >
                <span
                  className="h-1 w-1 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--text-muted)" }}
                />
                {e}
              </div>
            ))}
          </div>
        </Island>
      ) : (
        <div className="flex flex-col">
          <p className="mb-2 ms-1 text-[12.5px] tabular-nums text-txt-muted">
            {t("settings.fam_org_activity_events", { count: total })}
          </p>
          {filtered_entries.length === 0 ? (
            <Island padding="lg">
              <IslandEmpty
                icon={<MagnifyingGlassIcon />}
                title={t("common.no_results")}
              />
            </Island>
          ) : (
            <Island divided className="overflow-hidden" padding="none">
              {filtered_entries.map((entry) => {
                const actor_member = entry.actor_username
                  ? members.find((m) => m.username === entry.actor_username)
                  : null;
                const actor_email = actor_member
                  ? `${actor_member.username}@${actor_member.email_domain}`
                  : entry.actor_username
                    ? `${entry.actor_username}@astermail.org`
                    : null;

                return (
                  <IslandRow
                    key={entry.id}
                    description={
                      <span title={format_activity_time(entry.created_at)}>
                        {last_seen_relative(entry.created_at, t)}
                      </span>
                    }
                    icon={family_row_icon(
                      activity_event_icon(entry.event_type),
                    )}
                    label={activity_event_text(t, entry)}
                    trailing={
                      actor_email ? (
                        <ProfileAvatar
                          className="flex-shrink-0"
                          email={actor_email}
                          name={entry.actor_username!}
                          size="xs"
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </Island>
          )}
        </div>
      )}

      {entries.length < total && (
        <PillButton
          className="self-center"
          disabled={loading}
          leading={loading ? <ButtonSpinner /> : undefined}
          type="button"
          variant="tonal"
          onClick={() => load_page(page + 1, filter_type || undefined)}
        >
          {t("settings.fam_org_activity_load_more")}
        </PillButton>
      )}
    </div>
  );
}
