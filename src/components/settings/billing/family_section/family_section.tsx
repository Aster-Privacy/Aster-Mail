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
import type { ComponentType, ReactNode, SVGProps } from "react";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlusIcon,
  UserGroupIcon,
  UsersIcon,
  LinkIcon,
  ArrowRightIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CreditCardIcon,
  EnvelopeIcon,
  FaceSmileIcon,
  GlobeAltIcon,
  FunnelIcon,
  ChartBarIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandDivider,
  IslandEmpty,
  IslandRow,
  PillButton,
} from "@aster/ui";

import { family_seat_usage } from "../family_seats";
import { KidsContent } from "../family_kids_addresses";

import { ActivityContent } from "./activity";
import { DomainsContent } from "./domains";
import { FiltersContent, MemberConsentPanel } from "./filters";
import { GroupsContent } from "./groups";
import { fetch_family_group, read_family_cache } from "./family_cache";
import {
  FamilyCreateBar,
  FamilyMeter,
  FamilyPageHeader,
  FamilySkeleton,
  FamilyStatusText,
  family_row_icon,
  use_family_seat_breakdown,
} from "./family_ui";
import {
  FamilySectionProps,
  FamilyTab,
  invite_sent_relative,
  storage_pct,
} from "./helpers";

import { SharedMailboxesTab } from "@/components/settings/billing/shared_mailboxes_tab";
import { Input } from "@/components/ui/input";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { ButtonSpinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import {
  BillingNotice,
  BillingSectionLabel,
} from "@/components/settings/billing/billing_layout";
import { BillingMeter } from "@/components/settings/billing/billing_meter";
import { change_plan } from "@/services/api/billing";
import {
  list_org_filters,
  get_data_retention,
  get_security_policy,
  get_member_compliance,
  type OrgFilter,
  type DataRetentionPolicy,
  type SecurityPolicy,
  type MemberComplianceInfo,
} from "@/services/api/family_org";
import {
  invite_member,
  create_invite_link,
  revoke_invite,
  remove_family_member,
  transfer_family_admin,
  leave_family,
  type FamilyGroupResponse,
  type FamilyMemberInfo,
} from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import type {} from "@/lib/i18n/types";
import { format_bytes } from "@/lib/utils";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
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

import { MemberGroupsContent, MemberRow } from "./member_row";
import { RetentionContent } from "./retention";
import { MemberSecurityView, SecurityContent } from "./security";

import { ignore_error } from "@/lib/ignore_error";
import { copy_text, copy_text_or_throw } from "@/utils/copy_text";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { format_decimal } from "@/lib/utils";
import { use_sticky_value } from "@/hooks/use_sticky_value";

export function FamilySection({ is_family_plan }: FamilySectionProps) {
  const { t } = use_i18n();
  const seat_breakdown_text = use_family_seat_breakdown();
  const { preferences, update_preference, has_loaded_from_server } =
    use_preferences();
  const { user } = use_auth();
  const user_id = user?.id ?? null;
  const root_ref = useRef<HTMLDivElement>(null);
  const [group, set_group] = useState<FamilyGroupResponse | null>(() =>
    read_family_cache(user_id),
  );
  const [group_load_failed, set_group_load_failed] = useState(false);
  const [tab, set_tab] = useState<FamilyTab>("overview");
  const [preloaded_filters, set_preloaded_filters] = useState<
    OrgFilter[] | null
  >(null);
  const [preloaded_security, set_preloaded_security] =
    useState<SecurityPolicy | null>(null);
  const [preloaded_retention, set_preloaded_retention] =
    useState<DataRetentionPolicy | null>(null);
  const [preloaded_compliance, set_preloaded_compliance] = useState<
    MemberComplianceInfo[] | null
  >(null);
  const [invite_email, set_invite_email] = useState("");
  const [invite_storage_gb, set_invite_storage_gb] = useState("500");
  const [revoking_invite_id, set_revoking_invite_id] = useState<string | null>(
    null,
  );
  const invite_defaults_seeded = useRef(false);
  const [invite_loading, set_invite_loading] = useState(false);
  const [show_invite_form, set_show_invite_form] = useState(false);
  const [remove_target, set_remove_target] = useState<FamilyMemberInfo | null>(
    null,
  );
  const [transfer_target, set_transfer_target] =
    useState<FamilyMemberInfo | null>(null);
  const [show_leave_dialog, set_show_leave_dialog] = useState(false);
  const remove_target_view = use_sticky_value(remove_target);
  const transfer_target_view = use_sticky_value(transfer_target);
  const [action_loading, set_action_loading] = useState(false);
  const [changing_plan, set_changing_plan] = useState(false);
  const [show_upgrade_confirm, set_show_upgrade_confirm] = useState(false);
  const [compliance_map, set_compliance_map] = useState<
    Record<string, MemberComplianceInfo>
  >({});
  const [compliance_loaded, set_compliance_loaded] = useState(false);
  const [compliance_failed, set_compliance_failed] = useState(false);
  const [wizard_open, set_wizard_open] = useState(false);
  const [wizard_eligible_group_id, set_wizard_eligible_group_id] = useState<
    string | null
  >(null);
  const [wizard_step, set_wizard_step] = useState(1);
  const [wizard_invite_email, set_wizard_invite_email] = useState("");
  const [wizard_invite_gb, set_wizard_invite_gb] = useState("500");
  const [wizard_invite_loading, set_wizard_invite_loading] = useState(false);
  const [wizard_sent_email, set_wizard_sent_email] = useState("");
  const [wizard_captcha, set_wizard_captcha] = useState<string | null>(null);
  const wizard_turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const [checklist_dismissed, set_checklist_dismissed] = useState(false);
  const [left, set_left] = useState(false);
  const [invite_captcha, set_invite_captcha] = useState<string | null>(null);
  const [invite_urls, set_invite_urls] = useState<Record<string, string>>({});
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const dismiss_checklist = () => {
    if (group?.id) {
      try {
        localStorage.setItem(
          `aster_family_checklist_dismissed_${group.id}`,
          "1",
        );
      } catch (caught) {
        ignore_error(
          "components/settings/billing/family_section/family_section:dismiss_checklist",
          caught,
        );
      }
    }
    set_checklist_dismissed(true);
  };

  useEffect(() => {
    if (!group?.id) return;
    try {
      set_checklist_dismissed(
        localStorage.getItem(`aster_family_checklist_dismissed_${group.id}`) ===
          "1",
      );
    } catch (caught) {
      ignore_error(
        "components/settings/billing/family_section/family_section:dismiss_checklist",
        caught,
      );
    }
  }, [group?.id]);

  useEffect(() => {
    if (group?.viewer_role !== "owner" || !group?.id) return;
    set_compliance_loaded(false);
    set_compliance_failed(false);
    get_member_compliance()
      .then((r) => {
        if (r.data) {
          const map: Record<string, MemberComplianceInfo> = {};

          r.data.forEach((m) => {
            map[m.user_id] = m;
          });
          set_compliance_map(map);
        } else {
          set_compliance_failed(true);
        }
      })
      .catch((caught) => {
        set_compliance_failed(true);
        ignore_error(
          "components/settings/billing/family_section/family_section:dismiss_checklist",
          caught,
        );
      })
      .finally(() => set_compliance_loaded(true));
  }, [group?.id, group?.viewer_role]);

  const cache_invite_url = useCallback(
    (group_id: string, invite_id: string, join_url: string) => {
      set_invite_urls((prev) => {
        const next = { ...prev, [invite_id]: join_url };

        try {
          localStorage.setItem(
            `aster_family_invite_urls_${group_id}`,
            JSON.stringify(next),
          );
        } catch (caught) {
          ignore_error(
            "components/settings/billing/family_section/family_section:dismiss_checklist",
            caught,
          );
        }

        return next;
      });
    },
    [],
  );

  const load_group = useCallback(async () => {
    try {
      const data = await fetch_family_group(user_id);

      if (!data) {
        set_group_load_failed(true);
      }

      if (data) {
        set_group_load_failed(false);
        set_group(data);
        if (data.viewer_role === "owner") {
          void Promise.all([
            list_org_filters()
              .then((r) => {
                if (r.data) set_preloaded_filters(r.data);
              })
              .catch((caught) =>
                ignore_error(
                  "components/settings/billing/family_section/family_section:dismiss_checklist",
                  caught,
                ),
              ),
            get_security_policy()
              .then((r) => {
                if (r.data) set_preloaded_security(r.data);
              })
              .catch((caught) =>
                ignore_error(
                  "components/settings/billing/family_section/family_section:dismiss_checklist",
                  caught,
                ),
              ),
            get_data_retention()
              .then((r) => {
                if (r.data) set_preloaded_retention(r.data);
              })
              .catch((caught) =>
                ignore_error(
                  "components/settings/billing/family_section/family_section:dismiss_checklist",
                  caught,
                ),
              ),
            get_member_compliance()
              .then((r) => {
                if (r.data) set_preloaded_compliance(r.data);
              })
              .catch((caught) =>
                ignore_error(
                  "components/settings/billing/family_section/family_section:dismiss_checklist",
                  caught,
                ),
              ),
          ]);
        }
        const remaining_seats = Math.max(
          1,
          family_seat_usage(data).seats_remaining,
        );
        const used_alloc =
          data.members
            .filter((m) => m.status === "active")
            .reduce((s, m) => s + m.allocated_storage_bytes, 0) +
          data.pending_invites.reduce(
            (s, i) => s + (i.allocated_storage_bytes || 0),
            0,
          );
        const remaining_bytes = Math.max(
          0,
          data.storage_pool_bytes - used_alloc,
        );
        const default_gb = String(
          Math.max(
            1,
            Math.round(remaining_bytes / remaining_seats / 1073741824),
          ),
        );

        if (!invite_defaults_seeded.current) {
          invite_defaults_seeded.current = true;
          set_invite_storage_gb(default_gb);
          set_wizard_invite_gb(default_gb);
        }
        const live_ids = new Set(data.pending_invites.map((i) => i.id));

        try {
          const raw = localStorage.getItem(
            `aster_family_invite_urls_${data.id}`,
          );
          const stored: Record<string, string> = raw ? JSON.parse(raw) : {};
          const pruned = Object.fromEntries(
            Object.entries(stored).filter(([id]) => live_ids.has(id)),
          );

          localStorage.setItem(
            `aster_family_invite_urls_${data.id}`,
            JSON.stringify(pruned),
          );
          set_invite_urls(pruned);
        } catch (caught) {
          ignore_error(
            "components/settings/billing/family_section/family_section:dismiss_checklist",
            caught,
          );
        }
        if (
          data.viewer_role === "owner" &&
          data.members.filter((m) => m.status === "active").length === 1
        ) {
          set_wizard_eligible_group_id(data.id);
        }
      }
    } catch {
      set_group_load_failed(true);
    }
  }, [user_id]);

  useEffect(() => {
    if (is_family_plan) load_group();
  }, [is_family_plan, load_group]);

  useEffect(() => {
    if (!wizard_eligible_group_id || wizard_open) return;
    if (!has_loaded_from_server) return;
    if (preferences.family_setup_wizard_dismissed) return;
    if (
      localStorage.getItem(`aster_family_setup_${wizard_eligible_group_id}`)
    ) {
      update_preference("family_setup_wizard_dismissed", true, true);

      return;
    }
    set_wizard_open(true);
  }, [
    wizard_eligible_group_id,
    wizard_open,
    has_loaded_from_server,
    preferences.family_setup_wizard_dismissed,
    update_preference,
  ]);

  useEffect(() => {
    const on_visible = () => {
      if (!document.hidden && is_family_plan) load_group();
    };

    document.addEventListener("visibilitychange", on_visible);

    return () => document.removeEventListener("visibilitychange", on_visible);
  }, [is_family_plan, load_group]);

  const is_owner = group?.viewer_role === "owner";
  const has_pending_link =
    group?.pending_invites.some((i) => i.link_only) ?? false;

  const handle_upgrade_to_family = async () => {
    set_show_upgrade_confirm(false);
    set_changing_plan(true);
    try {
      // Single attempt only - never blind-retry a billing mutation with a
      // different interval (could create a second plan change if the first
      // succeeded server-side but returned a transient error).
      const res = await change_plan("family", "year");

      if (res.ok) {
        if (res.requires_checkout) return;
        show_toast(t("settings.fam_org_plan_upgraded"), "success");
        window.location.reload();
      } else {
        show_toast(
          server_error_text(res.error, t("settings.failed_save_setting")),
          "error",
        );
      }
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_changing_plan(false);
    }
  };

  const handle_wizard_invite = async () => {
    const email = wizard_invite_email.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show_toast(t("settings.fam_org_invalid_email"), "error");

      return;
    }
    const storage = Math.round(parseFloat(wizard_invite_gb) * 1073741824);

    if (!wizard_invite_gb || isNaN(storage) || storage < 1) {
      show_toast(t("settings.fam_org_invalid_storage"), "error");

      return;
    }
    if (turnstile_required && !wizard_captcha) {
      show_toast(t("settings.fam_org_captcha_required"), "error");

      return;
    }
    set_wizard_invite_loading(true);
    try {
      const res = await invite_member(
        email,
        storage,
        wizard_captcha ?? undefined,
      );

      if (res.error) {
        show_toast(
          res.error && res.error.toLowerCase().includes("pending invite")
            ? t("settings.fam_org_invite_exists")
            : t("settings.fam_org_action_failed"),
          "error",
        );

        return;
      }
      set_wizard_sent_email(email);
      set_wizard_step(3);
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_wizard_invite_loading(false);
      set_wizard_captcha(null);
      wizard_turnstile_ref.current?.reset();
    }
  };

  const close_wizard = () => {
    try {
      if (group) localStorage.setItem(`aster_family_setup_${group.id}`, "1");
    } catch (caught) {
      ignore_error(
        "components/settings/billing/family_section/family_section:close_wizard",
        caught,
      );
    }
    update_preference("family_setup_wizard_dismissed", true, true);
    set_wizard_eligible_group_id(null);
    set_wizard_open(false);
    set_wizard_step(1);
    set_wizard_invite_email("");
    set_wizard_sent_email("");
  };

  const handle_invite_email = async () => {
    const email = invite_email.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show_toast(t("settings.fam_org_invalid_email"), "error");

      return;
    }
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);

    if (!invite_storage_gb || isNaN(storage) || storage < 1) {
      show_toast(t("settings.fam_org_invalid_storage"), "error");

      return;
    }
    if (turnstile_required && !invite_captcha) {
      show_toast(t("settings.fam_org_captcha_required"), "error");

      return;
    }
    set_invite_loading(true);
    try {
      const res = await invite_member(
        email,
        storage,
        invite_captcha ?? undefined,
      );

      if (res.error) {
        show_toast(
          res.error && res.error.toLowerCase().includes("pending invite")
            ? t("settings.fam_org_invite_exists")
            : t("settings.fam_org_action_failed"),
          "error",
        );

        return;
      }
      if (res.data && group)
        cache_invite_url(group.id, res.data.invite_id, res.data.join_url);
      show_toast(t("settings.family_invite_sent"), "success");
      set_invite_email("");
      set_show_invite_form(false);
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_invite_loading(false);
      set_invite_captcha(null);
      turnstile_ref.current?.reset();
    }
  };

  const handle_copy_link = async () => {
    const storage = Math.round(parseFloat(invite_storage_gb) * 1073741824);

    if (!invite_storage_gb || isNaN(storage) || storage < 1) {
      show_toast(t("settings.fam_org_invalid_storage"), "error");

      return;
    }
    if (turnstile_required && !invite_captcha) {
      show_toast(t("settings.fam_org_captcha_required"), "error");

      return;
    }
    set_invite_loading(true);
    try {
      const res = await create_invite_link(
        storage,
        invite_captcha ?? undefined,
      );

      if (!res.data) throw new Error();
      if (group)
        cache_invite_url(group.id, res.data.invite_id, res.data.join_url);
      try {
        await copy_text_or_throw(res.data.join_url);
        show_toast(t("settings.family_invite_link_copied"), "success");
      } catch {
        show_toast(t("common.failed_to_copy"), "error");
      }
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_invite_loading(false);
      set_invite_captcha(null);
      turnstile_ref.current?.reset();
    }
  };

  const handle_revoke_invite = async (invite_id: string) => {
    if (revoking_invite_id) return;
    set_revoking_invite_id(invite_id);
    try {
      const r = await revoke_invite(invite_id);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      show_toast(t("settings.fam_org_invite_revoked_toast"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_revoking_invite_id(null);
    }
  };

  const handle_remove_confirm = async () => {
    if (!remove_target) return;
    set_action_loading(true);
    try {
      const r = await remove_family_member(remove_target.user_id);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      show_toast(t("settings.fam_org_member_removed_toast"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_remove_target(null);
    }
  };

  const handle_transfer_confirm = async () => {
    if (!transfer_target) return;
    set_action_loading(true);
    try {
      const r = await transfer_family_admin(transfer_target.user_id);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      show_toast(t("settings.fam_org_admin_transferred_toast"), "success");
      await load_group();
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_transfer_target(null);
    }
  };

  const handle_leave_confirm = async () => {
    set_action_loading(true);
    try {
      const r = await leave_family();

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      show_toast(t("settings.family_leave"), "success");
      set_left(true);
      set_group(null);
      window.dispatchEvent(new CustomEvent("aster:plan-changed"));
    } catch {
      show_toast(t("settings.failed_save_setting"), "error");
    } finally {
      set_action_loading(false);
      set_show_leave_dialog(false);
    }
  };

  if (!is_family_plan) return null;

  if (left) {
    return (
      <Island padding="lg">
        <IslandEmpty
          description={t("settings.fam_org_left_desc")}
          icon={<CheckCircleIcon style={{ color: "var(--color-success)" }} />}
          title={t("settings.fam_org_left_title")}
        />
      </Island>
    );
  }

  if (!group) {
    if (!group_load_failed) return <FamilySkeleton />;

    return (
      <Island padding="lg">
        <IslandEmpty
          action={
            <PillButton
              size="sm"
              type="button"
              variant="tonal"
              onClick={() => {
                set_group_load_failed(false);
                void load_group();
              }}
            >
              {t("settings.fam_org_refresh")}
            </PillButton>
          }
          description={t("common.something_went_wrong_try_again")}
          icon={<ExclamationTriangleIcon />}
          title={t("settings.fam_org_heading")}
        />
      </Island>
    );
  }

  const active_members = group.members.filter((m) => m.status === "active");
  const other_members = active_members.filter((m) => m.role !== "owner");
  const pool_used = group.storage_used_bytes;
  const pool_pct = storage_pct(pool_used, group.storage_pool_bytes);
  const {
    seats_used,
    seats_remaining,
    seats_full,
    breakdown: seat_breakdown,
  } = family_seat_usage(group);
  const member_alloc = active_members.reduce(
    (s, m) => s + m.allocated_storage_bytes,
    0,
  );
  const pending_alloc = group.pending_invites.reduce(
    (s, i) => s + (i.allocated_storage_bytes || 0),
    0,
  );
  const allocated_alloc = member_alloc + pending_alloc;
  const unassigned_bytes = Math.max(
    0,
    group.storage_pool_bytes - allocated_alloc,
  );
  const allocated_pct = storage_pct(
    Math.min(allocated_alloc, group.storage_pool_bytes),
    group.storage_pool_bytes,
  );

  const grace_has_lapsed =
    group.status === "grace" &&
    !!group.grace_period_end &&
    new Date(group.grace_period_end).getTime() <= Date.now();

  const status_tone: "success" | "warning" | "danger" =
    group.status === "active"
      ? "success"
      : group.status === "grace" && !grace_has_lapsed
        ? "warning"
        : "danger";
  const status_label =
    group.status === "active"
      ? t("settings.fam_org_status_active")
      : group.status === "grace" && !grace_has_lapsed
        ? t("settings.fam_org_status_expiring")
        : group.status === "grace"
          ? t("settings.fam_org_status_expired")
          : t("settings.fam_org_status_cancelled");

  const go_billing = () =>
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "billing" }),
    );

  const comp_values = Object.values(compliance_map);
  const compliant_count = comp_values.filter((m) => m.has_2fa).length;
  const security_value = !compliance_loaded
    ? null
    : compliance_failed || comp_values.length === 0
      ? null
      : compliant_count === comp_values.length
        ? t("settings.fam_org_summary_all_2fa")
        : t("settings.fam_org_summary_partial_2fa", {
            compliant: compliant_count,
            total: comp_values.length,
          });

  const page_titles: Partial<Record<FamilyTab, string>> = {
    members: t("settings.fam_org_tab_members"),
    kids: t("settings.fam_kids_tab"),
    shared: t("shared_mailboxes.tab_label"),
    groups: t("settings.fam_org_tab_groups"),
    activity: t("settings.fam_org_tab_activity"),
    filters: t("settings.fam_org_tab_filters"),
    domains: t("settings.fam_org_tab_domains"),
    security: t("settings.fam_org_tab_security"),
    retention: t("settings.fam_org_tab_retention"),
  };
  const page_descriptions: Partial<Record<FamilyTab, string>> = {
    members: t("settings.fam_org_row_members_desc"),
    kids: t("settings.fam_org_row_kids_desc"),
    shared: t("settings.fam_org_row_shared_desc"),
    groups: t("settings.fam_org_row_groups_desc"),
    activity: t("settings.fam_org_row_activity_desc"),
    filters: t("settings.fam_org_row_filters_desc"),
    domains: t("settings.fam_org_row_domains_desc"),
    security: t("settings.fam_org_row_security_desc"),
    retention: t("settings.fam_org_row_retention_desc"),
  };

  const open_tab = (next: FamilyTab) => {
    set_tab(next);
    requestAnimationFrame(() => {
      root_ref.current?.scrollIntoView({ block: "start" });
    });
  };

  const checklist = is_owner
    ? [
        {
          label: t("settings.fam_org_checklist_subscribe"),
          done: true,
          tab_target: null as FamilyTab | null,
        },
        {
          label: t("settings.fam_org_checklist_invite"),
          done: active_members.length > 1 || group.pending_invites.length > 0,
          tab_target: "members" as FamilyTab | null,
        },
        {
          label: t("settings.fam_org_checklist_security"),
          done: comp_values.length > 0 && comp_values.every((m) => m.has_2fa),
          tab_target: "security" as FamilyTab | null,
        },
      ]
    : [];
  const checklist_completed = checklist.filter((c) => c.done).length;
  const show_checklist =
    is_owner && !checklist_dismissed && checklist_completed < checklist.length;

  const hero = (
    <Island padding="none">
      <div className="mx-2 mt-2 flex h-[88px] items-center justify-between gap-4 rounded-[var(--aster-radius-field)] bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] px-5">
        <img
          alt={t("common.aster_mail")}
          className="h-8 w-auto select-none"
          decoding="sync"
          draggable={false}
          height={199}
          loading="eager"
          src="/text_logo.png"
          width={800}
        />
        <div className="flex items-center">
          {active_members.slice(0, 4).map((m, i) => (
            <span
              key={m.user_id}
              className="rounded-full"
              style={{
                marginInlineStart: i === 0 ? 0 : -8,
                boxShadow:
                  "0 0 0 2px var(--aster-floating-bg, var(--bg-primary))",
              }}
            >
              <ProfileAvatar
                email={`${m.username}@${m.email_domain}`}
                name={m.username}
                size="sm"
              />
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5 px-5 pb-5 pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h4 className="text-[21px] font-bold leading-7 tracking-[-0.02em] text-txt-primary">
              {group.plan_name}
            </h4>
            <FamilyStatusText tone={status_tone}>
              {status_label}
            </FamilyStatusText>
          </div>
          <p className="text-[13px] text-txt-muted">
            {is_owner
              ? t("settings.fam_org_you_manage")
              : t("settings.fam_org_you_are_member")}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <FamilyMeter
            label={t("settings.fam_org_meter_seats")}
            percent={
              group.max_members > 0
                ? (seats_used / group.max_members) * 100
                : 0
            }
            value={t("settings.usage_of", {
              current: seats_used,
              limit: group.max_members,
            })}
          />
          {seat_breakdown && (
            <p className="-mt-2 text-[12.5px] text-txt-muted">
              {seat_breakdown_text(seat_breakdown)}
            </p>
          )}
          <BillingMeter
            label={t("settings.fam_org_stat_storage_used")}
            limit_bytes={group.storage_pool_bytes}
            percent={pool_pct}
            used_bytes={pool_used}
          />
          {is_owner && (
            <FamilyMeter
              label={t("settings.fam_org_meter_assigned")}
              percent={allocated_pct}
              tone={
                allocated_alloc > group.storage_pool_bytes ? "danger" : "accent"
              }
              trailing={
                <span className="text-[12.5px] text-txt-muted">
                  {t("settings.fam_org_unassigned_value", {
                    size: format_bytes(unassigned_bytes),
                  })}
                </span>
              }
              value={t("settings.fam_org_assigned_of_total", {
                used: format_bytes(allocated_alloc),
                total: format_bytes(group.storage_pool_bytes),
              })}
            />
          )}
        </div>

        {is_owner && seats_full && group.plan_name === "Duo" && (
          <div
            className="flex flex-col gap-3 rounded-[var(--aster-radius-field)] p-4 sm:flex-row sm:items-center"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-color) 9%, transparent)",
            }}
          >
            <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-txt-primary">
              {t("settings.fam_org_seats_full_notice")}
            </p>
            <PillButton
              className="self-start sm:self-auto"
              disabled={changing_plan}
              size="sm"
              type="button"
              variant="filled"
              onClick={() => set_show_upgrade_confirm(true)}
            >
              {t("settings.fam_org_upgrade")}
            </PillButton>
          </div>
        )}
      </div>

      <IslandDivider />

      <div>
        {is_owner ? (
          <IslandRow
            description={t("settings.fam_org_manage_billing_plan")}
            icon={family_row_icon(CreditCardIcon)}
            label={t("settings.fam_org_manage_billing")}
            on_press={go_billing}
          />
        ) : (
          <IslandRow
            destructive
            description={t("settings.fam_org_leave_desc")}
            icon={family_row_icon(ArrowRightOnRectangleIcon)}
            label={t("settings.family_leave")}
            on_press={() => set_show_leave_dialog(true)}
          />
        )}
      </div>
    </Island>
  );

  const status_notice = group.status !== "active" && (
    <BillingNotice
      role="alert"
      title={
        group.status === "grace"
          ? group.grace_period_end
            ? t(
                grace_has_lapsed
                  ? "settings.fam_org_grace_banner_expired"
                  : "settings.fam_org_grace_banner",
                {
                  date: new Date(group.grace_period_end).toLocaleDateString(
                    app_locale(),
                    { timeZone: get_display_time_zone() },
                  ),
                },
              )
            : t("settings.fam_org_grace_banner_soon")
          : t("settings.fam_org_cancelled_banner")
      }
      tone={status_tone === "warning" ? "warning" : "danger"}
    >
      {is_owner && (
        <PillButton
          size="sm"
          type="button"
          variant="filled"
          onClick={go_billing}
        >
          {t("settings.fam_org_manage_billing")}
        </PillButton>
      )}
    </BillingNotice>
  );

  const checklist_island = show_checklist && (
    <Island className="overflow-hidden" padding="none">
      <div className="flex flex-col gap-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14.5px] font-semibold text-txt-primary">
            {t("settings.fam_org_checklist_title")}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] tabular-nums text-txt-muted">
              {checklist_completed}/{checklist.length}
            </span>
            <button
              aria-label={t("settings.fam_org_2fa_dismiss")}
              className="-me-1.5 flex h-7 w-7 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
              title={t("settings.fam_org_2fa_dismiss")}
              type="button"
              onClick={dismiss_checklist}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--text-primary) 10%, transparent)",
          }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${(checklist_completed / checklist.length) * 100}%`,
              backgroundColor: "var(--accent-color)",
            }}
          />
        </div>
      </div>
      <IslandDivider />
      <div>
        {checklist.map((item) => (
          <IslandRow
            key={item.label}
            chevron={!item.done && !!item.tab_target}
            icon={
              item.done ? (
                <CheckCircleIcon
                  className="h-[22px] w-[22px]"
                  style={{ color: "var(--color-success)" }}
                />
              ) : (
                <span className="flex h-[22px] w-[22px] items-center justify-center">
                  <span className="h-[18px] w-[18px] rounded-full border-2 border-[color-mix(in_srgb,var(--text-primary)_22%,transparent)]" />
                </span>
              )
            }
            label={
              <span className={item.done ? "text-txt-muted line-through" : ""}>
                {item.label}
              </span>
            }
            on_press={
              !item.done && item.tab_target
                ? () => open_tab(item.tab_target as FamilyTab)
                : undefined
            }
          />
        ))}
      </div>
    </Island>
  );

  const nav_row = (
    id: FamilyTab,
    Icon: ComponentType<SVGProps<SVGSVGElement>>,
    value?: ReactNode,
  ) => (
    <IslandRow
      key={id}
      chevron
      description={page_descriptions[id]}
      icon={family_row_icon(Icon)}
      label={page_titles[id]}
      on_press={() => open_tab(id)}
      value={value}
    />
  );

  const home = (
    <>
      {status_notice}
      {hero}
      {checklist_island}
      {is_owner ? (
        <>
          <div className="flex flex-col">
            <BillingSectionLabel>
              {t("settings.fam_org_section_people")}
            </BillingSectionLabel>
            <Island divided className="overflow-hidden" padding="none">
              {nav_row(
                "members",
                UsersIcon,
                group.pending_invites.length > 0
                  ? t("settings.fam_org_stat_pending", {
                      count: group.pending_invites.length,
                    })
                  : `${seats_used}/${group.max_members}`,
              )}
              {nav_row("kids", FaceSmileIcon)}
              {nav_row("shared", InboxStackIcon)}
              {nav_row("groups", UserGroupIcon)}
            </Island>
          </div>
          <div className="flex flex-col">
            <BillingSectionLabel>
              {t("settings.fam_org_section_controls")}
            </BillingSectionLabel>
            <Island divided className="overflow-hidden" padding="none">
              {nav_row("security", ShieldCheckIcon, security_value)}
              {nav_row("filters", FunnelIcon)}
              {nav_row("domains", GlobeAltIcon)}
              {nav_row("retention", ArchiveBoxIcon)}
              {nav_row("activity", ChartBarIcon)}
            </Island>
          </div>
        </>
      ) : (
        <>
          <MemberConsentPanel />
          <div className="flex flex-col">
            <BillingSectionLabel>
              {t("settings.fam_org_section_people")}
            </BillingSectionLabel>
            <Island divided className="overflow-hidden" padding="none">
              {active_members.map((m) => (
                <IslandRow
                  key={m.user_id}
                  description={`${m.username}@${m.email_domain}`}
                  icon={
                    <ProfileAvatar
                      email={`${m.username}@${m.email_domain}`}
                      name={m.username}
                      size="sm"
                    />
                  }
                  label={m.display_name || m.username}
                  value={
                    m.role === "owner"
                      ? t("settings.fam_org_preview_owner")
                      : t("settings.family_member_member")
                  }
                />
              ))}
            </Island>
          </div>
          <div className="flex flex-col">
            <BillingSectionLabel>
              {t("settings.fam_org_section_controls")}
            </BillingSectionLabel>
            <Island divided className="overflow-hidden" padding="none">
              {nav_row("groups", UserGroupIcon)}
              {nav_row("security", ShieldCheckIcon)}
            </Island>
          </div>
        </>
      )}
    </>
  );

  const invite_bytes = Math.round(
    (parseFloat(invite_storage_gb) || 0) * 1073741824,
  );
  const invite_over = allocated_alloc + invite_bytes > group.storage_pool_bytes;
  const pool_remaining_raw = Math.max(
    0,
    group.storage_pool_bytes - member_alloc,
  );

  const members_page = (
    <>
      <Island className="overflow-hidden" padding="none">
        {[
          ...active_members.filter((m) => m.role === "owner"),
          ...other_members,
        ].map((m, i) => (
          <div key={m.user_id}>
            {i > 0 && <IslandDivider />}
            <MemberRow
              compliance={compliance_map[m.user_id]}
              is_owner_view={true}
              member={m}
              on_reload={load_group}
              on_remove={set_remove_target}
              on_transfer={set_transfer_target}
              pool_remaining_bytes={pool_remaining_raw}
            />
          </div>
        ))}
        {other_members.length === 0 && !show_invite_form && (
          <>
            <IslandDivider />
            <IslandEmpty
              action={
                !seats_full && (
                  <PillButton
                    leading={<UserPlusIcon className="h-4 w-4" />}
                    size="sm"
                    type="button"
                    variant="filled"
                    onClick={() => set_show_invite_form(true)}
                  >
                    {t("settings.family_invite_member")}
                  </PillButton>
                )
              }
              description={t("settings.fam_org_no_members_desc")}
              icon={<UsersIcon />}
              title={t("settings.fam_org_no_members_title")}
            />
          </>
        )}
      </Island>

      {!seats_full && (show_invite_form || other_members.length > 0) && (
        <div className="flex flex-col">
          <BillingSectionLabel>
            {t("settings.fam_org_invite_title")}
          </BillingSectionLabel>
          {!show_invite_form ? (
            <Island className="overflow-hidden" padding="none">
              <IslandRow
                chevron
                description={t("settings.fam_org_stat_seats_available", {
                  count: seats_remaining,
                })}
                icon={family_row_icon(UserPlusIcon)}
                label={t("settings.fam_org_add_member")}
                on_press={() => set_show_invite_form(true)}
              />
            </Island>
          ) : (
            <Island className="flex flex-col gap-4" padding="md">
              <FamilyCreateBar>
                <Input
                  autoFocus
                  aria-label={t("settings.family_invite_email_placeholder")}
                  className="aster_input_tonal sm:flex-1"
                  placeholder={t("settings.family_invite_email_placeholder")}
                  type="email"
                  value={invite_email}
                  onChange={(e) => set_invite_email(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !invite_loading)
                      void handle_invite_email();
                  }}
                />
                <div className="relative sm:w-32">
                  <Input
                    aria-label={t("settings.family_invite_storage")}
                    className="aster_input_tonal pe-10"
                    min="1"
                    type="number"
                    value={invite_storage_gb}
                    onChange={(e) => set_invite_storage_gb(e.target.value)}
                  />
                  <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-[13px] text-txt-muted">
                    {t("settings.fam_org_gb")}
                  </span>
                </div>
              </FamilyCreateBar>
              <p
                className="text-[12.5px] leading-5"
                style={{
                  color: invite_over
                    ? "var(--color-danger)"
                    : "var(--text-muted)",
                }}
              >
                {invite_over
                  ? t("settings.fam_org_invite_summary_over", {
                      member: format_bytes(invite_bytes),
                      avail: format_bytes(
                        Math.max(0, group.storage_pool_bytes - allocated_alloc),
                      ),
                    })
                  : t("settings.fam_org_invite_summary", {
                      member: format_bytes(invite_bytes),
                      free: format_bytes(
                        Math.max(
                          0,
                          group.storage_pool_bytes -
                            allocated_alloc -
                            invite_bytes,
                        ),
                      ),
                      pool: format_bytes(group.storage_pool_bytes),
                    })}
              </p>
              {turnstile_required && (
                <TurnstileWidget
                  ref={turnstile_ref}
                  class_name="flex justify-start"
                  on_expire={() => set_invite_captcha(null)}
                  on_verify={set_invite_captcha}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  disabled={
                    invite_loading || (turnstile_required && !invite_captcha)
                  }
                  leading={
                    invite_loading ? (
                      <ButtonSpinner />
                    ) : (
                      <UserPlusIcon className="h-4 w-4" />
                    )
                  }
                  type="button"
                  variant="filled"
                  onClick={handle_invite_email}
                >
                  {t("settings.family_invite_send")}
                </PillButton>
                <PillButton
                  disabled={
                    invite_loading ||
                    has_pending_link ||
                    (turnstile_required && !invite_captcha)
                  }
                  leading={<LinkIcon className="h-4 w-4" />}
                  title={
                    has_pending_link
                      ? t("settings.fam_org_revoke_link_first")
                      : undefined
                  }
                  type="button"
                  variant="tonal"
                  onClick={handle_copy_link}
                >
                  {t("settings.family_invite_copy_link")}
                </PillButton>
                <PillButton
                  type="button"
                  variant="ghost"
                  onClick={() => set_show_invite_form(false)}
                >
                  {t("settings.fam_org_invite_cancel")}
                </PillButton>
              </div>
            </Island>
          )}
        </div>
      )}

      {group.pending_invites.length > 0 && (
        <div className="flex flex-col">
          <BillingSectionLabel>
            {t("settings.family_invite_pending")}
          </BillingSectionLabel>
          <Island divided className="overflow-hidden" padding="none">
            {group.pending_invites.map((inv) => {
              const meta = [
                t("settings.family_invite_expires", {
                  date: new Date(inv.expires_at).toLocaleDateString(
                    app_locale(),
                    { timeZone: get_display_time_zone() },
                  ),
                }),
                inv.allocated_storage_bytes > 0
                  ? t("settings.fam_org_invite_allocated", {
                      count: Math.round(
                        inv.allocated_storage_bytes / 1073741824,
                      ),
                    })
                  : null,
                inv.created_at
                  ? t("settings.fam_org_invite_sent_ago", {
                      time: invite_sent_relative(inv.created_at, t),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <IslandRow
                  key={inv.id}
                  description={meta}
                  icon={family_row_icon(
                    inv.link_only ? LinkIcon : EnvelopeIcon,
                  )}
                  label={
                    inv.link_only
                      ? t("settings.family_invite_link")
                      : t("settings.family_invite_by_email")
                  }
                  trailing={
                    <div className="flex items-center gap-1.5">
                      {invite_urls[inv.id] && (
                        <PillButton
                          leading={<LinkIcon className="h-3.5 w-3.5" />}
                          size="sm"
                          type="button"
                          variant="tonal"
                          onClick={async () => {
                            if (await copy_text(invite_urls[inv.id])) {
                              show_toast(
                                t("settings.family_invite_link_copied"),
                                "success",
                              );
                            } else {
                              show_toast(t("common.failed_to_copy"), "error");
                            }
                          }}
                        >
                          {t("common.copy")}
                        </PillButton>
                      )}
                      <PillButton
                        disabled={revoking_invite_id === inv.id}
                        size="sm"
                        type="button"
                        className="!text-[var(--color-danger)]"
                        variant="ghost"
                        onClick={() => handle_revoke_invite(inv.id)}
                      >
                        {t("settings.family_invite_revoke")}
                      </PillButton>
                    </div>
                  }
                />
              );
            })}
          </Island>
        </div>
      )}
    </>
  );

  const is_home = tab === "overview";
  const header_trailing =
    tab === "members" ? (
      <span className="text-[13px] tabular-nums text-txt-muted">
        {t("settings.fam_org_members_count", {
          used: seats_used,
          max: group.max_members,
          count: seats_remaining,
        })}
      </span>
    ) : undefined;

  return (
    <div ref={root_ref} className="flex w-full min-w-0 flex-col gap-4">
      {is_home ? (
        home
      ) : (
        <>
          <FamilyPageHeader
            description={page_descriptions[tab]}
            on_back={() => open_tab("overview")}
            title={page_titles[tab]}
            trailing={header_trailing}
          />
          {tab === "members" && is_owner && members_page}
          {tab === "kids" && is_owner && <KidsContent group={group} />}
          {tab === "shared" && is_owner && (
            <SharedMailboxesTab
              group={group}
              my_user_id={
                group.members.find((m) => m.role === "owner")?.user_id ?? ""
              }
            />
          )}
          {tab === "groups" && is_owner && (
            <GroupsContent members={active_members} />
          )}
          {tab === "groups" && !is_owner && <MemberGroupsContent />}
          {tab === "activity" && is_owner && (
            <ActivityContent members={active_members} />
          )}
          {tab === "filters" && is_owner && (
            <FiltersContent
              initial_filters={preloaded_filters}
              other_member_count={active_members.length - 1}
            />
          )}
          {tab === "domains" && is_owner && (
            <DomainsContent members={active_members} />
          )}
          {tab === "security" && is_owner && (
            <SecurityContent
              initial_compliance={preloaded_compliance}
              initial_security={preloaded_security}
              other_member_count={active_members.length - 1}
            />
          )}
          {tab === "security" && !is_owner && <MemberSecurityView />}
          {tab === "retention" && is_owner && (
            <RetentionContent
              initial_retention={preloaded_retention}
              other_member_count={active_members.length - 1}
            />
          )}
        </>
      )}

      {wizard_open && (
        <Modal
          close_on_overlay={false}
          is_open={wizard_open}
          on_close={close_wizard}
          size="md"
        >
          {wizard_step === 1 && (
            <>
              <ModalHeader>
                <div className="flex flex-col items-center gap-3 pt-2 pb-1">
                  <UserGroupIcon className="w-12 h-12 text-accent-blue" />
                  <ModalTitle className="text-xl font-bold text-center">
                    {t("settings.fam_org_wizard_welcome")}
                  </ModalTitle>
                </div>
              </ModalHeader>
              <div className="px-6 pb-4 space-y-4">
                <ModalDescription className="sr-only">
                  {t("settings.fam_org_wizard_setup_desc")}
                </ModalDescription>
                <div className="text-center space-y-2">
                  <span className="aster_badge aster_badge_blue">
                    {group.plan_name}
                  </span>
                  <p className="text-sm text-txt-secondary">
                    {t("settings.fam_org_wizard_storage_summary", {
                      storage: format_bytes(group.storage_pool_bytes),
                      count: group.max_members,
                    })}
                  </p>
                </div>
                <Island divided className="overflow-hidden" padding="none">
                  {(
                    [
                      {
                        Icon: UserPlusIcon,
                        label: t("settings.fam_org_wizard_feat_members"),
                        desc: t("settings.fam_org_wizard_feat_members_desc", {
                          count: group.max_members,
                        }),
                      },
                      {
                        Icon: ShieldCheckIcon,
                        label: t("settings.fam_org_wizard_feat_security"),
                        desc: t("settings.fam_org_wizard_feat_security_desc"),
                      },
                      {
                        Icon: UserGroupIcon,
                        label: t("settings.fam_org_wizard_feat_groups"),
                        desc: t("settings.fam_org_wizard_feat_groups_desc"),
                      },
                      {
                        Icon: FunnelIcon,
                        label: t("settings.fam_org_wizard_feat_filters"),
                        desc: t("settings.fam_org_wizard_feat_filters_desc"),
                      },
                      {
                        Icon: GlobeAltIcon,
                        label: t("settings.fam_org_wizard_feat_domains"),
                        desc: t("settings.fam_org_wizard_feat_domains_desc"),
                      },
                      {
                        Icon: ArchiveBoxIcon,
                        label: t("settings.fam_org_wizard_feat_retention"),
                        desc: t("settings.fam_org_wizard_feat_retention_desc"),
                      },
                    ] as const
                  ).map(({ Icon, label, desc }) => (
                    <IslandRow
                      key={label}
                      description={desc}
                      icon={family_row_icon(Icon)}
                      label={label}
                    />
                  ))}
                </Island>
              </div>
              <ModalFooter>
                <Button variant="ghost" onClick={close_wizard}>
                  {t("settings.fam_org_wizard_not_now")}
                </Button>
                <Button variant="depth" onClick={() => set_wizard_step(2)}>
                  {t("settings.fam_org_wizard_get_started")}{" "}
                  <ArrowRightIcon className="w-4 h-4 ms-1 rtl:-scale-x-100" />
                </Button>
              </ModalFooter>
            </>
          )}
          {wizard_step === 2 &&
            (() => {
              const pool_gb = group.storage_pool_bytes / 1073741824;
              const used_alloc = group.members.reduce(
                (s, m) => s + m.allocated_storage_bytes,
                0,
              );
              const used_gb = used_alloc / 1073741824;
              const invite_gb_num = Math.max(
                0,
                parseFloat(wizard_invite_gb) || 0,
              );
              const remaining_gb = Math.max(
                0,
                pool_gb - used_gb - invite_gb_num,
              );
              const low_remaining = remaining_gb / pool_gb < 0.1;

              return (
                <>
                  <ModalHeader>
                    <ModalTitle>
                      {t("settings.fam_org_wizard_invite_title")}
                    </ModalTitle>
                    <ModalDescription>
                      {t("settings.fam_org_wizard_invite_desc")}
                    </ModalDescription>
                  </ModalHeader>
                  <div className="px-6 pb-4 space-y-4">
                    <Input
                      autoFocus
                      placeholder={t(
                        "settings.fam_org_wizard_member_placeholder",
                      )}
                      type="email"
                      value={wizard_invite_email}
                      onChange={(e) => set_wizard_invite_email(e.target.value)}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-txt-muted">
                          {t("settings.fam_org_wizard_storage_label")}
                        </label>
                        <div className="flex items-center gap-1">
                          <Input
                            className="aster_input_tonal w-20"
                            max={String(
                              Math.max(1, Math.floor(pool_gb - used_gb)),
                            )}
                            min="1"
                            type="number"
                            value={wizard_invite_gb}
                            onChange={(e) =>
                              set_wizard_invite_gb(e.target.value)
                            }
                          />
                          <span className="text-xs text-txt-muted">
                            {t("settings.fam_org_gb")}
                          </span>
                        </div>
                      </div>
                      <p
                        className="mt-0.5 text-xs"
                        style={{
                          color: low_remaining
                            ? "var(--color-warning)"
                            : "var(--text-muted)",
                        }}
                      >
                        {t("settings.fam_org_wizard_pool_remaining", {
                          count: format_decimal(remaining_gb, 1),
                        })}
                      </p>
                    </div>
                    {turnstile_required && (
                      <TurnstileWidget
                        ref={wizard_turnstile_ref}
                        on_expire={() => set_wizard_captcha(null)}
                        on_verify={set_wizard_captcha}
                      />
                    )}
                  </div>
                  <ModalFooter>
                    <Button variant="ghost" onClick={() => set_wizard_step(1)}>
                      {t("settings.fam_org_wizard_back")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => set_wizard_step(3)}
                    >
                      {t("settings.fam_org_wizard_skip")}
                    </Button>
                    <Button
                      disabled={
                        !wizard_invite_email.trim() ||
                        wizard_invite_loading ||
                        (turnstile_required && !wizard_captcha)
                      }
                      variant="depth"
                      onClick={handle_wizard_invite}
                    >
                      {t("settings.fam_org_wizard_send_invite")}
                      {wizard_invite_loading && <ButtonSpinner />}
                    </Button>
                  </ModalFooter>
                </>
              );
            })()}
          {wizard_step === 3 && (
            <>
              <ModalHeader>
                <ModalTitle>
                  {wizard_sent_email
                    ? t("settings.fam_org_wizard_done_title_sent")
                    : t("settings.fam_org_wizard_done_title")}
                </ModalTitle>
                <ModalDescription>
                  {wizard_sent_email
                    ? t("settings.fam_org_wizard_done_desc_sent", {
                        email: wizard_sent_email,
                      })
                    : t("settings.fam_org_wizard_done_desc")}
                </ModalDescription>
              </ModalHeader>
              <div className="flex flex-col gap-3 px-6 pb-4">
                {wizard_sent_email && (
                  <div
                    className="flex items-center gap-2.5 rounded-[var(--aster-radius-field)] px-4 py-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--color-success) 12%, transparent)",
                    }}
                  >
                    <CheckCircleIcon
                      className="h-5 w-5 flex-shrink-0"
                      style={{ color: "var(--color-success)" }}
                    />
                    <p className="text-sm font-medium text-txt-primary">
                      {t("settings.fam_org_wizard_invite_sent_to", {
                        email: wizard_sent_email,
                      })}
                    </p>
                  </div>
                )}
                <Island divided className="overflow-hidden" padding="none">
                  {[
                    {
                      Icon: ShieldCheckIcon,
                      tab: "security" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_security"),
                      desc: t("settings.fam_org_wizard_grid_security_desc"),
                    },
                    {
                      Icon: UserGroupIcon,
                      tab: "groups" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_groups"),
                      desc: t("settings.fam_org_wizard_grid_groups_desc"),
                    },
                    {
                      Icon: FunnelIcon,
                      tab: "filters" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_filters"),
                      desc: t("settings.fam_org_wizard_grid_filters_desc"),
                    },
                    {
                      Icon: GlobeAltIcon,
                      tab: "domains" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_domains"),
                      desc: t("settings.fam_org_wizard_grid_domains_desc"),
                    },
                    {
                      Icon: ArchiveBoxIcon,
                      tab: "retention" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_retention"),
                      desc: t("settings.fam_org_wizard_grid_retention_desc"),
                    },
                    {
                      Icon: ChartBarIcon,
                      tab: "activity" as FamilyTab,
                      label: t("settings.fam_org_wizard_grid_activity"),
                      desc: t("settings.fam_org_wizard_grid_activity_desc"),
                    },
                  ].map(({ Icon, tab: target_tab, label, desc }) => (
                    <IslandRow
                      key={label}
                      chevron
                      description={desc}
                      icon={family_row_icon(Icon)}
                      label={label}
                      on_press={() => {
                        close_wizard();
                        set_tab(target_tab);
                      }}
                    />
                  ))}
                </Island>
              </div>
              <ModalFooter>
                <Button variant="ghost" onClick={() => set_wizard_step(2)}>
                  {t("settings.fam_org_wizard_back")}
                </Button>
                <Button variant="depth" onClick={close_wizard}>
                  {t("settings.fam_org_wizard_done")}
                </Button>
              </ModalFooter>
            </>
          )}
        </Modal>
      )}

      <AlertDialog
        open={show_upgrade_confirm}
        onOpenChange={(open) => !open && set_show_upgrade_confirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.plan_change_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.plan_change_confirm_description", {
                plan: t("settings.family_plan_title"),
              })}{" "}
              {t("settings.billing_yearly")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={changing_plan}
              onClick={handle_upgrade_to_family}
            >
              {t("settings.plan_change_confirm_button")}
              {changing_plan && <ButtonSpinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!remove_target}
        onOpenChange={(open) => !open && set_remove_target(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_remove_confirm_title", {
                name: remove_target_view?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_remove_confirm_body", {
                name: remove_target_view?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive"
              disabled={action_loading}
              onClick={handle_remove_confirm}
            >
              {t("settings.family_remove_confirm_action")}
              {action_loading && <ButtonSpinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!transfer_target}
        onOpenChange={(open) => !open && set_transfer_target(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_transfer_confirm_title", {
                name: transfer_target_view?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_transfer_confirm_body", {
                name: transfer_target_view?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={action_loading}
              onClick={handle_transfer_confirm}
            >
              {t("settings.family_transfer_confirm_action")}
              {action_loading && <ButtonSpinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={show_leave_dialog}
        onOpenChange={set_show_leave_dialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.family_leave_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_leave_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="aster_btn_destructive"
              disabled={action_loading}
              onClick={handle_leave_confirm}
            >
              {t("settings.family_leave_confirm_action")}
              {action_loading && <ButtonSpinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
