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
} from "@heroicons/react/24/outline";

import {
  activity_event_text,
  event_labels,
  format_activity_time,
  last_seen_relative,
} from "./helpers";
import { SkeletonRows } from "./shared";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

export function ActivityContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [entries, set_entries] = useState<ActivityLogEntry[]>([]);
  const [total, set_total] = useState(0);
  const [page, set_page] = useState(1);
  const [loading, set_loading] = useState(true);
  const [filter_type, set_filter_type] = useState("");
  const [search, set_search] = useState("");

  const load_page = useCallback(
    async (p: number, ft?: string) => {
      set_loading(true);
      try {
        const r = await get_activity_log(p, 20, ft);

        if (r.data) {
          if (p === 1) set_entries(r.data.entries);
          else set_entries((prev) => [...prev, ...r.data!.entries]);
          set_total(r.data.total);
          set_page(p);
        } else {
          show_toast(t("settings.fam_org_action_failed"), "error");
        }
      } catch {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={t("settings.fam_org_activity_search_placeholder")}
          size="sm"
          value={search}
          onChange={(e) => set_search(e.target.value)}
        />
        <Select
          value={filter_type || "all"}
          onValueChange={(v) => set_filter_type(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-48">
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
      </div>
      <span className="text-sm text-txt-muted">
        {t("settings.fam_org_activity_events", { count: total })}
      </span>
      {loading && entries.length === 0 ? (
        <SkeletonRows count={4} />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <ChartBarIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_activity_empty_title")}
          </p>
          <p className="text-xs text-txt-muted text-center max-w-xs">
            {t("settings.fam_org_activity_empty_desc")}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-start">
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
                className="flex items-center gap-1.5 text-xs text-txt-muted"
              >
                <div className="w-1 h-1 rounded-full bg-edge-secondary flex-shrink-0" />
                {e}
              </div>
            ))}
          </div>
        </div>
      ) : filtered_entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-txt-muted">
          {t("common.no_results")}
        </p>
      ) : (
        <div className="divide-y divide-edge-secondary">
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
              <div key={entry.id} className="flex items-center gap-3 py-3">
                {actor_email && (
                  <ProfileAvatar
                    className="flex-shrink-0"
                    email={actor_email}
                    name={entry.actor_username!}
                    size="sm"
                  />
                )}
                {!entry.actor_username && (
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-edge-secondary" />
                  </div>
                )}
                <div className="flex-shrink-0">
                  {["member_joined", "invite_sent"].includes(
                    entry.event_type,
                  ) ? (
                    <UserPlusIcon className="w-5 h-5 text-txt-muted" />
                  ) : [
                      "member_removed",
                      "invite_revoked",
                      "group_deleted",
                    ].includes(entry.event_type) ? (
                    <TrashIcon className="w-5 h-5 text-txt-muted" />
                  ) : ["admin_transferred", "storage_updated"].includes(
                      entry.event_type,
                    ) ? (
                    <ArrowsRightLeftIcon className="w-5 h-5 text-txt-muted" />
                  ) : [
                      "security_policy_updated",
                      "security_notify_sent",
                    ].includes(entry.event_type) ? (
                    <ShieldCheckIcon className="w-5 h-5 text-txt-muted" />
                  ) : ["retention_updated"].includes(entry.event_type) ? (
                    <ArchiveBoxIcon className="w-5 h-5 text-txt-muted" />
                  ) : ["domain_shared"].includes(entry.event_type) ? (
                    <GlobeAltIcon className="w-5 h-5 text-txt-muted" />
                  ) : (
                    <PlusIcon className="w-5 h-5 text-txt-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-txt-primary">
                    {activity_event_text(t, entry)}
                  </span>
                  <p
                    className="text-xs text-txt-muted mt-0.5"
                    title={format_activity_time(entry.created_at)}
                  >
                    {last_seen_relative(entry.created_at, t)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {entries.length < total && (
        <button
          className="aster_btn aster_btn_secondary aster_btn_sm disabled:opacity-50"
          disabled={loading}
          onClick={() => load_page(page + 1, filter_type || undefined)}
        >
          {loading ? (
            <Spinner size="sm" />
          ) : (
            t("settings.fam_org_activity_load_more")
          )}
        </button>
      )}
    </div>
  );
}
