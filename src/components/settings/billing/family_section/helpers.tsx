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
import type { TranslationKey } from "@/lib/i18n/types";
import {
  app_hour12,
  app_locale,
  calendar_day_diff,
  get_display_time_zone,
} from "@/utils/date_format";

export type FamilyTab =
  | "overview"
  | "members"
  | "kids"
  | "shared"
  | "groups"
  | "activity"
  | "filters"
  | "domains"
  | "security"
  | "retention";

export type TFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function event_labels(t: TFn): Record<string, string> {
  return {
    member_joined: t("settings.fam_org_event_member_joined"),
    member_removed: t("settings.fam_org_event_member_removed"),
    member_left: t("settings.fam_org_event_member_left"),
    admin_transferred: t("settings.fam_org_event_admin_transferred"),
    group_created: t("settings.fam_org_event_group_created"),
    group_deleted: t("settings.fam_org_event_group_deleted"),
    group_member_added: t("settings.fam_org_event_group_member_added"),
    group_member_removed: t("settings.fam_org_event_group_member_removed"),
    filter_created: t("settings.fam_org_event_filter_created"),
    domain_shared: t("settings.fam_org_event_domain_shared"),
    retention_updated: t("settings.fam_org_event_retention_updated"),
    security_policy_updated: t(
      "settings.fam_org_event_security_policy_updated",
    ),
    invite_sent: t("settings.fam_org_event_invite_sent"),
    invite_revoked: t("settings.fam_org_event_invite_revoked"),
    storage_updated: t("settings.fam_org_event_storage_updated"),
    security_notify_sent: t("settings.fam_org_event_security_notify_sent"),
    address_reserved: t("settings.fam_org_event_address_reserved"),
    reservation_released: t("settings.fam_org_event_reservation_released"),
    shared_mailbox_created: t("settings.fam_org_event_shared_mailbox_created"),
    shared_mailbox_deleted: t("settings.fam_org_event_shared_mailbox_deleted"),
    shared_mailbox_grant_added: t(
      "settings.fam_org_event_shared_mailbox_grant_added",
    ),
    shared_mailbox_grant_revoked: t(
      "settings.fam_org_event_shared_mailbox_grant_revoked",
    ),
    shared_mailbox_rotated: t("settings.fam_org_event_shared_mailbox_rotated"),
    consent_request_created: t(
      "settings.fam_org_event_consent_request_created",
    ),
    consent_declined: t("settings.fam_org_event_consent_declined"),
    consent_all_accepted: t("settings.fam_org_event_consent_all_accepted"),
  };
}

export function humanize_event_type(event_type: string): string {
  const words = event_type.replace(/_/g, " ").trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : event_type;
}

export interface FamilySectionProps {
  is_family_plan: boolean;
}

export function storage_pct(used: number, total: number) {
  return total > 0 ? Math.min(100, (used / total) * 100) : 0;
}

export function last_seen_relative(
  iso: string | null | undefined,
  t: TFn,
): string {
  if (!iso) return t("settings.fam_org_time_never_seen");
  const parsed = new Date(iso).getTime();

  if (!Number.isFinite(parsed)) return t("settings.fam_org_time_never_seen");
  const diff_ms = Date.now() - parsed;
  const mins = Math.floor(diff_ms / 60000);

  if (mins < 2) return t("settings.fam_org_time_just_now");
  if (mins < 60) return t("settings.fam_org_time_minutes", { count: mins });
  const hrs = Math.floor(mins / 60);

  if (hrs < 24)
    return t(
      hrs === 1 ? "settings.fam_org_time_hour" : "settings.fam_org_time_hours",
      { count: hrs },
    );
  const days = Math.floor(hrs / 24);

  if (days === 1) return t("settings.fam_org_time_yesterday");
  if (days < 30) return t("settings.fam_org_time_days", { count: days });
  const months = Math.floor(days / 30);

  if (months < 12)
    return t(
      months === 1
        ? "settings.fam_org_time_month"
        : "settings.fam_org_time_months",
      { count: months },
    );
  const years = Math.floor(months / 12);

  return t(
    years === 1 ? "settings.fam_org_time_year" : "settings.fam_org_time_years",
    { count: years },
  );
}

export function invite_sent_relative(iso: string, t: TFn): string {
  const parsed = new Date(iso).getTime();

  if (!Number.isFinite(parsed)) return "";
  const days = calendar_day_diff(new Date(parsed), new Date());

  if (days < 1) return t("settings.fam_org_time_today");
  if (days === 1) return t("settings.fam_org_time_one_day_ago");

  return t("settings.fam_org_time_days", { count: days });
}

export function format_activity_time(iso: string): string {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString(app_locale(), {
    timeZone: get_display_time_zone(),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    hour12: app_hour12(),
    minute: "2-digit",
  });
}

export function activity_event_text(
  t: TFn,
  entry: {
    event_type: string;
    actor_username: string | null;
    target_username: string | null;
  },
): string {
  const actor = entry.actor_username ?? t("settings.fam_org_activity_someone");
  const target = entry.target_username;

  switch (entry.event_type) {
    case "member_joined":
      return target
        ? t("settings.fam_org_activity_member_joined", { target })
        : t("settings.fam_org_activity_member_joined_generic");
    case "member_removed":
      return target
        ? t("settings.fam_org_activity_member_removed", { actor, target })
        : t("settings.fam_org_activity_member_removed_generic", { actor });
    case "member_left":
      return target
        ? t("settings.fam_org_activity_member_left", { target })
        : t("settings.fam_org_activity_member_left_generic");
    case "admin_transferred":
      return target
        ? t("settings.fam_org_activity_admin_transferred", { actor, target })
        : t("settings.fam_org_activity_admin_transferred_generic", { actor });
    case "group_created":
      return t("settings.fam_org_activity_group_created", { actor });
    case "group_deleted":
      return t("settings.fam_org_activity_group_deleted", { actor });
    case "filter_created":
      return t("settings.fam_org_activity_filter_created", { actor });
    case "domain_shared":
      return target
        ? t("settings.fam_org_activity_domain_shared", { actor, target })
        : t("settings.fam_org_activity_domain_shared_generic", { actor });
    case "retention_updated":
      return t("settings.fam_org_activity_retention_updated", { actor });
    case "security_policy_updated":
      return t("settings.fam_org_activity_security_policy_updated", { actor });
    case "security_notify_sent":
      return t("settings.fam_org_activity_security_notify_sent", { actor });
    case "invite_sent":
      return target
        ? t("settings.fam_org_activity_invite_sent", { actor, target })
        : t("settings.fam_org_activity_invite_sent_generic", { actor });
    case "invite_revoked":
      return target
        ? t("settings.fam_org_activity_invite_revoked", { actor, target })
        : t("settings.fam_org_activity_invite_revoked_generic", { actor });
    case "storage_updated":
      return target
        ? t("settings.fam_org_activity_storage_updated", { actor, target })
        : t("settings.fam_org_activity_storage_updated_generic", { actor });
    case "group_member_added":
      return target
        ? t("settings.fam_org_activity_group_member_added", { actor, target })
        : t("settings.fam_org_activity_group_member_added_generic", { actor });
    case "group_member_removed":
      return target
        ? t("settings.fam_org_activity_group_member_removed", { actor, target })
        : t("settings.fam_org_activity_group_member_removed_generic", {
            actor,
          });
    case "address_reserved":
      return t("settings.fam_org_activity_address_reserved", { actor });
    case "reservation_released":
      return t("settings.fam_org_activity_reservation_released", { actor });
    case "shared_mailbox_created":
      return t("settings.fam_org_activity_shared_mailbox_created", { actor });
    case "shared_mailbox_deleted":
      return t("settings.fam_org_activity_shared_mailbox_deleted", { actor });
    case "shared_mailbox_grant_added":
      return t("settings.fam_org_activity_shared_mailbox_grant_added", {
        actor,
      });
    case "shared_mailbox_grant_revoked":
      return t("settings.fam_org_activity_shared_mailbox_grant_revoked", {
        actor,
      });
    case "shared_mailbox_rotated":
      return t("settings.fam_org_activity_shared_mailbox_rotated", { actor });
    case "consent_request_created":
      return t("settings.fam_org_activity_consent_request_created", { actor });
    case "consent_declined":
      return t("settings.fam_org_activity_consent_declined", { actor });
    case "consent_all_accepted":
      return t("settings.fam_org_activity_consent_all_accepted");
    default:
      return (
        event_labels(t)[entry.event_type] ??
        humanize_event_type(entry.event_type)
      );
  }
}
