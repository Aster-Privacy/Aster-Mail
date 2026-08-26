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
  UserPlusIcon,
  UserGroupIcon,
  Squares2X2Icon,
  LinkIcon,
  ArrowRightIcon,
  XMarkIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  GlobeAltIcon,
  FunnelIcon,
  ChartBarIcon,
  UserIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { family_seat_usage } from "../family_seats";
import { KidsContent } from "../family_kids_addresses";

import { ActivityContent } from "./activity";
import { DomainsContent } from "./domains";
import { FiltersContent, MemberConsentPanel } from "./filters";
import { GroupsContent } from "./groups";
import {
  FamilySectionProps,
  FamilyTab,
  invite_sent_relative,
  storage_pct,
} from "./helpers";

import { SharedMailboxesTab } from "@/components/settings/billing/shared_mailboxes_tab";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { server_error_text } from "@/components/settings/billing/server_error_text";
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
  get_family_group,
  invite_member,
  create_invite_link,
  revoke_invite,
  remove_family_member,
  transfer_family_admin,
  leave_family,
  type FamilyGroupResponse,
  type FamilyMemberInfo,
} from "@/services/api/family";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { StatRing } from "@/components/settings/stat_ring";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
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

export function FamilySection({ is_family_plan }: FamilySectionProps) {
  const { t } = use_i18n();
  const { preferences, update_preference, has_loaded_from_server } =
    use_preferences();
  const [group, set_group] = useState<FamilyGroupResponse | null>(null);
  const [loading, set_loading] = useState(true);
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
      const res = await get_family_group();

      if (!res.data) {
        set_group_load_failed(true);
      }

      if (res.data) {
        set_group_load_failed(false);
        set_group(res.data);
        if (res.data.viewer_role === "owner") {
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
          family_seat_usage(res.data).seats_remaining,
        );
        const used_alloc =
          res.data.members
            .filter((m) => m.status === "active")
            .reduce((s, m) => s + m.allocated_storage_bytes, 0) +
          res.data.pending_invites.reduce(
            (s, i) => s + (i.allocated_storage_bytes || 0),
            0,
          );
        const remaining_bytes = Math.max(
          0,
          res.data.storage_pool_bytes - used_alloc,
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
        const live_ids = new Set(res.data.pending_invites.map((i) => i.id));

        try {
          const raw = localStorage.getItem(
            `aster_family_invite_urls_${res.data.id}`,
          );
          const stored: Record<string, string> = raw ? JSON.parse(raw) : {};
          const pruned = Object.fromEntries(
            Object.entries(stored).filter(([id]) => live_ids.has(id)),
          );

          localStorage.setItem(
            `aster_family_invite_urls_${res.data.id}`,
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
          res.data.viewer_role === "owner" &&
          res.data.members.filter((m) => m.status === "active").length === 1
        ) {
          set_wizard_eligible_group_id(res.data.id);
        }
      }
    } catch {
      set_group_load_failed(true);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_family_plan) load_group();
    else set_loading(false);
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

  if (!is_family_plan || loading) return null;

  if (left) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">
          {t("settings.fam_org_heading")}
        </h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircleIcon className="w-10 h-10 text-green-500" />
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_left_title")}
          </p>
          <p className="text-xs text-txt-muted max-w-xs">
            {t("settings.fam_org_left_desc")}
          </p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-txt-primary">
          {t("settings.fam_org_heading")}
        </h2>
        <div className="mt-2 h-px bg-edge-secondary" />
        {group_load_failed ? (
          <p className="py-8 text-center text-sm text-txt-muted">
            {t("common.something_went_wrong_try_again")}
          </p>
        ) : (
          <div className="flex justify-center items-center gap-2 py-8">
            <Spinner size="sm" />
            <span className="text-sm text-txt-muted">
              {t("settings.fam_org_setting_up")}
            </span>
          </div>
        )}
        <button
          className="aster_btn aster_btn_secondary aster_btn_sm"
          onClick={() => {
            set_group_load_failed(false);
            void load_group();
          }}
        >
          {t("settings.fam_org_refresh")}
        </button>
      </div>
    );
  }

  const active_members = group.members.filter((m) => m.status === "active");
  const pool_used = group.storage_used_bytes;
  const pool_pct = storage_pct(pool_used, group.storage_pool_bytes);
  const {
    seats_used,
    seats_remaining,
    seats_full,
    breakdown: seat_breakdown,
  } = family_seat_usage(group);
  const allocated_alloc =
    active_members.reduce((s, m) => s + m.allocated_storage_bytes, 0) +
    group.pending_invites.reduce(
      (s, i) => s + (i.allocated_storage_bytes || 0),
      0,
    );
  const unassigned_bytes = Math.max(
    0,
    group.storage_pool_bytes - allocated_alloc,
  );
  const unassigned_pct = storage_pct(
    unassigned_bytes,
    group.storage_pool_bytes,
  );

  type OwnTab = { id: FamilyTab; label: string; Icon: React.ElementType };
  const owner_tabs: OwnTab[] = is_owner
    ? [
        {
          id: "overview",
          label: t("settings.fam_org_tab_overview"),
          Icon: Squares2X2Icon,
        },
        {
          id: "members",
          label: t("settings.fam_org_tab_members"),
          Icon: UserPlusIcon,
        },
        { id: "kids", label: t("settings.fam_kids_tab"), Icon: UserIcon },
        {
          id: "shared",
          label: t("shared_mailboxes.tab_label"),
          Icon: InboxStackIcon,
        },
        {
          id: "groups",
          label: t("settings.fam_org_tab_groups"),
          Icon: UserGroupIcon,
        },
        {
          id: "activity",
          label: t("settings.fam_org_tab_activity"),
          Icon: ChartBarIcon,
        },
        {
          id: "filters",
          label: t("settings.fam_org_tab_filters"),
          Icon: FunnelIcon,
        },
        {
          id: "domains",
          label: t("settings.fam_org_tab_domains"),
          Icon: GlobeAltIcon,
        },
        {
          id: "security",
          label: t("settings.fam_org_tab_security"),
          Icon: ShieldCheckIcon,
        },
        {
          id: "retention",
          label: t("settings.fam_org_tab_retention"),
          Icon: ArchiveBoxIcon,
        },
      ]
    : [];

  return (
    <div className="space-y-4 w-full min-w-0">
      {group.status !== "active" && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: group.status === "grace" ? "#f59e0b" : "#ef4444",
            border: "none",
          }}
        >
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-white" />
          <p className="text-sm font-medium flex-1 min-w-0 text-white">
            {group.status === "grace"
              ? group.grace_period_end
                ? t("settings.fam_org_grace_banner", {
                    date: new Date(group.grace_period_end).toLocaleDateString(
                      app_locale(),
                      { timeZone: get_display_time_zone() },
                    ),
                  })
                : t("settings.fam_org_grace_banner_soon")
              : t("settings.fam_org_cancelled_banner")}
          </p>
          <button
            className="text-xs font-semibold hover:underline flex-shrink-0 text-white"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("navigate-settings", { detail: "billing" }),
              )
            }
          >
            {t("settings.fam_org_manage_billing")}
          </button>
        </div>
      )}
      <div>
        <h2 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          {t("settings.fam_org_heading")}
          <span className="aster_badge aster_badge_blue">
            {group.plan_name}
          </span>
          {group.status === "active" ? (
            <span className="aster_badge aster_badge_green">
              {t("settings.fam_org_status_active")}
            </span>
          ) : group.status === "grace" ? (
            <span className="aster_badge aster_badge_amber">
              {t("settings.fam_org_status_expiring")}
            </span>
          ) : (
            <span className="aster_badge aster_badge_red">
              {t("settings.fam_org_status_cancelled")}
            </span>
          )}
        </h2>
        <p className="text-sm text-txt-secondary mt-0.5">
          {t("settings.fam_org_members_count", {
            used: seats_used,
            max: group.max_members,
            count: seats_remaining,
          })}
        </p>
        {seat_breakdown && (
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.fam_seats_breakdown", {
              members: seat_breakdown.active_members,
              invites: seat_breakdown.pending_invites,
              reserved: seat_breakdown.reserved_addresses,
            })}
          </p>
        )}
      </div>

      {is_owner && (
        <SettingsTabBar<FamilyTab>
          active={tab}
          layout_id="family"
          on_change={set_tab}
          tabs={owner_tabs.map((t_item) => ({
            key: t_item.id,
            label: t_item.label,
            icon: <t_item.Icon className="w-3.5 h-3.5 flex-shrink-0" />,
          }))}
        />
      )}

      {!is_owner && (
        <SettingsTabBar<FamilyTab>
          active={tab}
          layout_id="family-member"
          on_change={set_tab}
          tabs={[
            { key: "overview", label: t("settings.fam_org_tab_overview") },
            { key: "groups", label: t("settings.fam_org_tab_groups") },
          ]}
        />
      )}

      {!is_owner && tab === "groups" && <MemberGroupsContent />}

      {(tab === "overview" || !is_owner) && tab !== "groups" && (
        <>
          {!is_owner && <MemberConsentPanel />}
          {is_owner &&
            (() => {
              const has_members =
                active_members.length > 1 || group.pending_invites.length > 0;
              const comp_values = Object.values(compliance_map);
              const security_done =
                comp_values.length > 0 && comp_values.every((m) => m.has_2fa);
              const checklist: {
                label: string;
                done: boolean;
                tab_target: FamilyTab | null;
              }[] = [
                {
                  label: t("settings.fam_org_checklist_subscribe"),
                  done: true,
                  tab_target: null,
                },
                {
                  label: t("settings.fam_org_checklist_invite"),
                  done: has_members,
                  tab_target: "members",
                },
                {
                  label: t("settings.fam_org_checklist_security"),
                  done: security_done,
                  tab_target: "security",
                },
              ];
              const completed = checklist.filter((c) => c.done).length;

              if (completed === checklist.length || checklist_dismissed)
                return null;

              return (
                <div className="rounded-xl border border-edge-secondary bg-surf-secondary p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-txt-primary">
                      {t("settings.fam_org_checklist_title")}
                    </p>
                    <button
                      aria-label={t("settings.fam_org_2fa_dismiss")}
                      className="p-0.5 -me-1 text-txt-muted hover:text-txt-secondary flex-shrink-0"
                      title={t("settings.fam_org_2fa_dismiss")}
                      onClick={dismiss_checklist}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-full h-1.5 bg-edge-secondary rounded-full mb-3">
                    <div
                      className="h-full bg-accent-blue rounded-full transition-all"
                      style={{
                        width: `${(completed / checklist.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    {checklist.map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2 ${!item.done && item.tab_target ? "cursor-pointer hover:bg-surf-primary rounded-lg px-1 -mx-1 transition-colors" : ""}`}
                        role={
                          !item.done && item.tab_target ? "button" : undefined
                        }
                        tabIndex={!item.done && item.tab_target ? 0 : undefined}
                        onClick={
                          !item.done && item.tab_target
                            ? () => set_tab(item.tab_target!)
                            : undefined
                        }
                        onKeyDown={
                          !item.done && item.tab_target
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ")
                                  set_tab(item.tab_target!);
                              }
                            : undefined
                        }
                      >
                        {item.done ? (
                          <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-edge-secondary flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm flex-1 ${item.done ? "text-txt-muted line-through" : "text-txt-primary"}`}
                        >
                          {item.label}
                        </span>
                        {!item.done && item.tab_target && (
                          <ChevronRightIcon className="w-4 h-4 text-txt-muted flex-shrink-0 rtl:-scale-x-100" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          <div className="grid grid-cols-3 gap-3">
            <StatRing
              color_class="text-txt-secondary"
              display_value={`${seats_used} / ${group.max_members}`}
              icon={UserGroupIcon}
              label={t("settings.fam_org_stat_members")}
              max={group.max_members}
              sublabel={
                group.pending_invites.length > 0
                  ? t("settings.fam_org_stat_pending", {
                      count: group.pending_invites.length,
                    })
                  : t("settings.fam_org_stat_seats_available", {
                      count: seats_remaining,
                    })
              }
              value={seats_used}
            />
            <StatRing
              color_class={
                pool_pct >= 90
                  ? "text-red-500"
                  : pool_pct >= 70
                    ? "text-amber-500"
                    : "text-accent-blue"
              }
              display_value={format_bytes(pool_used)}
              icon={CircleStackIcon}
              label={t("settings.fam_org_stat_storage_used")}
              max={100}
              sublabel={t("settings.fam_org_stat_of_total", {
                total: format_bytes(group.storage_pool_bytes),
              })}
              value={pool_pct}
            />
            <StatRing
              color_class={
                unassigned_pct <= 10
                  ? "text-red-500"
                  : unassigned_pct <= 30
                    ? "text-amber-500"
                    : "text-accent-blue"
              }
              display_value={format_bytes(unassigned_bytes)}
              icon={ArchiveBoxIcon}
              label={t("settings.fam_org_stat_unassigned")}
              max={100}
              sublabel={t("settings.fam_org_stat_of_total", {
                total: format_bytes(group.storage_pool_bytes),
              })}
              value={unassigned_pct}
            />
          </div>

          <div className="space-y-1.5 py-1">
            {active_members.slice(0, 4).map((m) => (
              <div key={m.user_id} className="flex items-center gap-2.5">
                <ProfileAvatar
                  email={`${m.username}@${m.email_domain}`}
                  name={m.username}
                  size="xs"
                />
                <span className="text-sm text-txt-primary truncate min-w-0 flex-1">
                  {m.username}@{m.email_domain}
                </span>
                {m.role === "owner" ? (
                  <span className="aster_badge aster_badge_blue flex-shrink-0">
                    {t("settings.fam_org_preview_owner")}
                  </span>
                ) : m.status === "grace" ? (
                  <span className="aster_badge aster_badge_amber flex-shrink-0">
                    {t("settings.family_member_grace")}
                  </span>
                ) : (
                  <span className="aster_badge aster_badge_gray flex-shrink-0">
                    {t("settings.family_member_member")}
                  </span>
                )}
              </div>
            ))}
            {active_members.length > 4 && (
              <p className="text-xs text-txt-muted ps-9">
                {t("settings.fam_org_preview_more", {
                  count: active_members.length - 4,
                })}
              </p>
            )}
            {is_owner && (
              <button
                className="mt-1 aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5"
                onClick={() => set_tab("members")}
              >
                <UserPlusIcon className="w-3.5 h-3.5" />{" "}
                {t("settings.fam_org_preview_manage")}
              </button>
            )}
          </div>

          {is_owner && (
            <button
              className="w-full text-start rounded-xl border border-edge-secondary px-4 py-3 hover:bg-surf-secondary transition-colors group"
              onClick={() => set_tab("security")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                  <span className="text-sm font-medium text-txt-primary">
                    {t("settings.fam_org_summary_security")}
                  </span>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-txt-muted group-hover:text-txt-secondary transition-colors rtl:-scale-x-100" />
              </div>
              {(() => {
                const comp_members = Object.values(compliance_map);

                if (!compliance_loaded) {
                  return (
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-txt-muted">
                        <Spinner size="sm" />{" "}
                        {t("settings.fam_org_summary_checking")}
                      </span>
                    </div>
                  );
                }
                if (compliance_failed) {
                  return (
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-xs text-txt-muted">
                        {t("common.something_went_wrong_try_again")}
                      </span>
                    </div>
                  );
                }
                if (comp_members.length === 0) return null;
                const compliant = comp_members.filter((m) => m.has_2fa).length;
                const total = comp_members.length;
                const all_ok = compliant === total;

                return (
                  <div className="flex items-center justify-between mt-2.5">
                    <span
                      className={
                        all_ok
                          ? "aster_badge aster_badge_green"
                          : "aster_badge aster_badge_amber"
                      }
                    >
                      {all_ok
                        ? t("settings.fam_org_summary_all_2fa")
                        : t("settings.fam_org_summary_partial_2fa", {
                            compliant,
                            total,
                          })}
                    </span>
                  </div>
                );
              })()}
            </button>
          )}

          {is_owner && seats_full && group.plan_name === "Duo" && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-edge-secondary">
              <InformationCircleIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
              <p className="text-sm text-txt-secondary flex-1">
                {t("settings.fam_org_seats_full_notice")}
              </p>
              <button
                className="aster_btn aster_btn_primary aster_btn_sm flex-shrink-0 disabled:opacity-50"
                disabled={changing_plan}
                onClick={() => set_show_upgrade_confirm(true)}
              >
                {t("settings.fam_org_upgrade")}
              </button>
            </div>
          )}

          {is_owner && (
            <button
              className="flex items-center gap-2 text-xs text-accent-blue hover:underline py-1"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("navigate-settings", { detail: "billing" }),
                )
              }
            >
              <ArrowRightIcon className="w-3.5 h-3.5 rtl:-scale-x-100" />
              {t("settings.fam_org_manage_billing_plan")}
            </button>
          )}

          {!is_owner && (
            <button
              className="aster_btn aster_btn_destructive aster_btn_sm"
              onClick={() => set_show_leave_dialog(true)}
            >
              {t("settings.family_leave")}
            </button>
          )}
        </>
      )}

      {tab === "members" && is_owner && (
        <>
          <div>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                {t("settings.family_members")}
                <InfoPopover
                  description={t("settings.fam_org_members_info_desc")}
                  title={t("settings.fam_org_members_info_title")}
                />
                <span className="ms-auto text-xs font-normal text-txt-muted">
                  {seats_used} / {group.max_members}
                </span>
              </h3>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>
            <div className="divide-y divide-edge-secondary">
              {(() => {
                const used_alloc = active_members.reduce(
                  (s, m) => s + m.allocated_storage_bytes,
                  0,
                );
                const pool_remaining_raw = Math.max(
                  0,
                  group.storage_pool_bytes - used_alloc,
                );

                return (
                  <>
                    {active_members
                      .filter((m) => m.role === "owner")
                      .map((m) => (
                        <MemberRow
                          key={m.user_id}
                          compliance={compliance_map[m.user_id]}
                          is_owner_view={true}
                          member={m}
                          on_reload={load_group}
                          on_remove={set_remove_target}
                          on_transfer={set_transfer_target}
                          pool_remaining_bytes={pool_remaining_raw}
                        />
                      ))}
                    {active_members.filter((m) => m.role !== "owner").length ===
                    0
                      ? !show_invite_form && (
                          <div className="flex flex-col items-center gap-3 py-8">
                            <UserGroupIcon className="w-8 h-8 text-txt-muted" />
                            <div className="text-center">
                              <p className="text-base font-semibold text-txt-primary">
                                {t("settings.fam_org_no_members_title")}
                              </p>
                              <p className="text-sm text-txt-muted mt-1">
                                {t("settings.fam_org_no_members_desc")}
                              </p>
                            </div>
                            <button
                              className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5"
                              onClick={() => set_show_invite_form(true)}
                            >
                              <UserPlusIcon className="w-4 h-4" />
                              {t("settings.family_invite_member")}
                            </button>
                          </div>
                        )
                      : active_members
                          .filter((m) => m.role !== "owner")
                          .map((m) => (
                            <MemberRow
                              key={m.user_id}
                              compliance={compliance_map[m.user_id]}
                              is_owner_view={true}
                              member={m}
                              on_reload={load_group}
                              on_remove={set_remove_target}
                              on_transfer={set_transfer_target}
                              pool_remaining_bytes={pool_remaining_raw}
                            />
                          ))}
                  </>
                );
              })()}
            </div>
          </div>

          {!seats_full &&
            (show_invite_form ||
              active_members.filter((m) => m.role !== "owner").length > 0) && (
              <div>
                <div className="mt-1 h-px bg-edge-secondary mb-3" />
                {!show_invite_form ? (
                  <button
                    className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5"
                    onClick={() => set_show_invite_form(true)}
                  >
                    <UserPlusIcon className="w-3.5 h-3.5" />{" "}
                    {t("settings.fam_org_add_member")}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-txt-muted mb-1 block">
                          {t("settings.family_invite_email_placeholder")}
                        </label>
                        <Input
                          autoFocus
                          placeholder={t(
                            "settings.family_invite_email_placeholder",
                          )}
                          type="email"
                          value={invite_email}
                          onChange={(e) => set_invite_email(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-txt-muted mb-1 block">
                          {t("settings.family_invite_storage")}
                        </label>
                        <div className="flex items-center gap-1">
                          <Input
                            min="1"
                            style={{ width: "5rem", flex: "0 0 auto" }}
                            type="number"
                            value={invite_storage_gb}
                            onChange={(e) =>
                              set_invite_storage_gb(e.target.value)
                            }
                          />
                          <span className="text-sm text-txt-muted">
                            {t("settings.fam_org_gb")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const pool = group.storage_pool_bytes;
                      // Match the backend pool check: active members' allocations
                      // PLUS outstanding pending-invite allocations.
                      const member_alloc = active_members.reduce(
                        (s, m) => s + m.allocated_storage_bytes,
                        0,
                      );
                      const pending_alloc = group.pending_invites.reduce(
                        (s, i) => s + (i.allocated_storage_bytes || 0),
                        0,
                      );
                      const used_alloc = member_alloc + pending_alloc;
                      const invite_bytes = Math.round(
                        (parseFloat(invite_storage_gb) || 0) * 1073741824,
                      );
                      const free = Math.max(
                        0,
                        pool - used_alloc - invite_bytes,
                      );
                      const over = used_alloc + invite_bytes > pool;

                      return (
                        <p
                          className={`text-xs leading-relaxed mt-1 ${over ? "text-red-500 font-medium" : "text-txt-muted"}`}
                        >
                          {over
                            ? t("settings.fam_org_invite_summary_over", {
                                member: format_bytes(invite_bytes),
                                avail: format_bytes(
                                  Math.max(0, pool - used_alloc),
                                ),
                              })
                            : t("settings.fam_org_invite_summary", {
                                member: format_bytes(invite_bytes),
                                free: format_bytes(free),
                                pool: format_bytes(pool),
                              })}
                        </p>
                      );
                    })()}
                    {turnstile_required && (
                      <TurnstileWidget
                        ref={turnstile_ref}
                        class_name="flex justify-start mt-4"
                        on_expire={() => set_invite_captcha(null)}
                        on_verify={set_invite_captcha}
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
                        disabled={
                          invite_loading ||
                          (turnstile_required && !invite_captcha)
                        }
                        onClick={handle_invite_email}
                      >
                        <UserPlusIcon className="w-4 h-4" />{" "}
                        {t("settings.family_invite_send")}
                      </button>
                      <button
                        className="aster_btn aster_btn_secondary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
                        disabled={
                          invite_loading ||
                          has_pending_link ||
                          (turnstile_required && !invite_captcha)
                        }
                        title={
                          has_pending_link
                            ? t("settings.fam_org_revoke_link_first")
                            : undefined
                        }
                        onClick={handle_copy_link}
                      >
                        <LinkIcon className="w-4 h-4" />{" "}
                        {t("settings.family_invite_copy_link")}
                      </button>
                      <button
                        className="aster_btn aster_btn_ghost aster_btn_sm"
                        onClick={() => set_show_invite_form(false)}
                      >
                        {t("settings.fam_org_invite_cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {group.pending_invites.length > 0 && (
            <div>
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-txt-muted uppercase tracking-wide">
                  {t("settings.family_invite_pending")}
                </h3>
                <div className="mt-2 h-px bg-edge-secondary" />
              </div>
              <div className="divide-y divide-edge-secondary">
                {group.pending_invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {inv.link_only ? (
                        <LinkIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
                      ) : (
                        <UserPlusIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm text-txt-primary">
                          {inv.link_only
                            ? t("settings.family_invite_link")
                            : t("settings.family_invite_by_email")}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("settings.family_invite_expires", {
                            date: new Date(inv.expires_at).toLocaleDateString(
                              app_locale(),
                              { timeZone: get_display_time_zone() },
                            ),
                          })}
                          {inv.allocated_storage_bytes > 0 && (
                            <span>
                              {" "}
                              ·{" "}
                              {t("settings.fam_org_invite_allocated", {
                                count: Math.round(
                                  inv.allocated_storage_bytes / 1073741824,
                                ),
                              })}
                            </span>
                          )}
                          {inv.created_at && (
                            <span>
                              {" "}
                              ·{" "}
                              {t("settings.fam_org_invite_sent_ago", {
                                time: invite_sent_relative(inv.created_at, t),
                              })}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {invite_urls[inv.id] && (
                        <button
                          className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5"
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
                          <LinkIcon className="w-3.5 h-3.5" />
                          {t("settings.family_invite_copy_link")}
                        </button>
                      )}
                      <button
                        className="aster_btn aster_btn_ghost aster_btn_sm text-red-500 hover:text-red-600 flex-shrink-0 disabled:opacity-50"
                        disabled={revoking_invite_id === inv.id}
                        onClick={() => handle_revoke_invite(inv.id)}
                      >
                        {t("settings.family_invite_revoke")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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
                <div className="rounded-xl border border-edge-secondary divide-y divide-edge-secondary">
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
                    <div
                      key={label}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Icon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-txt-primary">
                          {label}
                        </span>
                        <span className="text-xs text-txt-muted ms-2">
                          {desc}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
                            className="w-20 h-8 text-sm"
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
                        className={`text-xs mt-0.5 ${low_remaining ? "text-amber-500" : "text-txt-muted"}`}
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
                      {wizard_invite_loading ? (
                        <Spinner size="sm" />
                      ) : (
                        t("settings.fam_org_wizard_send_invite")
                      )}
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
              <div className="px-6 pb-4 space-y-3">
                {wizard_sent_email && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                    style={{ background: "#22c55e", border: "none" }}
                  >
                    <CheckCircleIcon className="w-4 h-4 text-white flex-shrink-0" />
                    <p className="text-sm font-medium text-white">
                      {t("settings.fam_org_wizard_invite_sent_to", {
                        email: wizard_sent_email,
                      })}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
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
                    <button
                      key={label}
                      className="flex flex-col gap-1.5 p-3 rounded-xl border border-edge-secondary bg-surf-primary hover:bg-surf-secondary text-start transition-colors group"
                      onClick={() => {
                        close_wizard();
                        set_tab(target_tab);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                        <span className="text-sm font-semibold text-txt-primary">
                          {label}
                        </span>
                        <ArrowRightIcon className="w-3 h-3 text-txt-muted ms-auto opacity-0 group-hover:opacity-100 transition-opacity rtl:-scale-x-100" />
                      </div>
                      <p className="text-xs text-txt-muted leading-relaxed">
                        {desc}
                      </p>
                    </button>
                  ))}
                </div>
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
              {changing_plan ? (
                <Spinner size="sm" />
              ) : (
                t("settings.plan_change_confirm_button")
              )}
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
                name: remove_target?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_remove_confirm_body", {
                name: remove_target?.username ?? "",
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
              {action_loading ? (
                <Spinner size="sm" />
              ) : (
                t("settings.family_remove_confirm_action")
              )}
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
                name: transfer_target?.username ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.family_transfer_confirm_body", {
                name: transfer_target?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={action_loading}
              onClick={handle_transfer_confirm}
            >
              {action_loading ? (
                <Spinner size="sm" />
              ) : (
                t("settings.family_transfer_confirm_action")
              )}
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
              {action_loading ? (
                <Spinner size="sm" />
              ) : (
                t("settings.family_leave_confirm_action")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
