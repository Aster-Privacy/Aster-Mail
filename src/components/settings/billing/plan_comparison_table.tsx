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

import type { ComponentType, SVGProps } from "react";

import { useMemo } from "react";
import {
  AtSymbolIcon,
  EnvelopeIcon,
  LifebuoyIcon,
  LockClosedIcon,
  NewspaperIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UserGroupIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { IslandRow, IslandSection, IslandSections } from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";

type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface ComparisonRow {
  category: string;
  label: string;
  free: string;
  star: string;
  nova: string;
  supernova: string;
  tip?: string;
}

const cap = (s: string) => {
  const trimmed = s.trim();

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export function get_plan_comparison_rows(
  t: TranslateFunction,
): ComparisonRow[] {
  const unlimited = t("settings.unlimited");
  const yes = "✓";
  const no = "-";
  const general = t("settings.plan_cat_general");
  const mail = t("settings.plan_cat_mail");
  const aliases = t("settings.plan_cat_advanced_aliases");
  const contacts = t("settings.plan_cat_contacts");
  const security = t("settings.plan_cat_security");
  const vanguard = t("settings.plan_cat_vanguard");
  const subs = t("settings.plan_cat_subscriptions");
  const support = t("settings.plan_cat_support");

  return [
    {
      category: general,
      label: cap(t("settings.plan_f_storage", { value: "" })),
      free: "10 GB",
      star: "50 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      category: general,
      label: t("settings.plan_f_signed_in_accounts"),
      tip: t("settings.plan_tip_signed_in_accounts"),
      free: "2",
      star: "3",
      nova: "5",
      supernova: "20",
    },
    {
      category: general,
      label: t("settings.f_e2ee"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: general,
      label: t("settings.f_zero_knowledge"),
      tip: t("settings.plan_tip_zero_knowledge"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: general,
      label: t("settings.plan_f_cross_platform"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_aliases", { value: "" })),
      free: "5",
      star: "15",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_domains", { value: "" })),
      free: "1",
      star: "5",
      nova: "30",
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_folders"),
      free: "10",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_sort_folders"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.f_folder_lock"),
      tip: t("settings.plan_tip_folder_lock"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.feature_labels"),
      free: "15",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_mail_rules", { value: "" })),
      free: "2",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_custom_categories"),
      tip: t("settings.plan_tip_custom_categories"),
      free: no,
      star: "1",
      nova: "3",
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_attachments", { value: "" })),
      tip: t("settings.plan_tip_attachments"),
      free: "25 MB",
      star: "50 MB",
      nova: "100 MB",
      supernova: "250 MB",
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_templates", { value: "" })),
      free: "3",
      star: "10",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_signatures", { value: "" })),
      free: "1",
      star: "5",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_ghost_aliases", { value: "" })),
      tip: t("settings.plan_tip_ghost_aliases"),
      free: "5",
      star: "25",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_scheduled_send"),
      free: `5${t("settings.per_month")}`,
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.feature_undo_send"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_snooze"),
      free: "15",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_read_receipts"),
      free: no,
      star: no,
      nova: no,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_smart_folders"),
      tip: t("settings.plan_tip_smart_folders"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_password_emails"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_expiration"),
      tip: t("settings.plan_tip_expiration"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_email_import"),
      tip: t("settings.plan_tip_email_import"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_email_export"),
      tip: t("settings.plan_tip_email_export"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_external_accounts"),
      tip: t("settings.ext_v2_plan_tip_external_accounts"),
      free: t("settings.ext_v2_plan_free_import"),
      star: "2",
      nova: "5",
      supernova: "20",
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_two_way_sync"),
      tip: t("settings.ext_v2_plan_tip_two_way_sync"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_instant_sync"),
      tip: t("settings.ext_v2_plan_tip_instant_sync"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_source_cleanup"),
      tip: t("settings.ext_v2_plan_tip_source_cleanup"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_send_only_accounts"),
      tip: t("settings.ext_v2_plan_tip_send_only_accounts"),
      free: "1",
      star: "5",
      nova: "10",
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_imap_smtp"),
      tip: t("settings.plan_tip_imap_smtp"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_carddav_import"),
      tip: t("settings.plan_tip_carddav"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_auto_forwarding"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_vacation_reply"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_quick_alias_reply"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_send_limit", { value: "" })),
      tip: t("settings.plan_tip_send_limit"),
      free: "200",
      star: "1,000",
      nova: "1,000",
      supernova: "1,000",
    },
    {
      category: mail,
      label: t("settings.plan_f_catch_all"),
      tip: t("settings.catch_all_description"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_catch_all_send"),
      tip: t("settings.ext_v2_plan_tip_catch_all_send"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.ext_v2_plan_f_custom_domain_primary"),
      tip: t("settings.ext_v2_plan_tip_custom_domain_primary"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_quiet_hours"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_auto_delete_spam"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_folder_auto_clean"),
      tip: t("settings.plan_tip_folder_auto_clean"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_avatars"),
      tip: t("settings.plan_tip_alias_avatars"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_extra_alias_domains"),
      tip: t("settings.plan_tip_extra_alias_domains"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_sender_pinning"),
      tip: t("settings.plan_tip_sender_pinning"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_per_alias_rules"),
      tip: t("settings.plan_tip_alias_rules"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_stats_restore"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_no_cooldown"),
      tip: t("settings.plan_tip_alias_no_cooldown"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_instant_alias_delete"),
      tip: t("settings.plan_tip_instant_alias_delete"),
      free: no,
      star: no,
      nova: no,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_directory"),
      tip: t("settings.plan_tip_alias_directory"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_reverse_alias"),
      tip: t("settings.plan_tip_reverse_alias"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_pin"),
      tip: t("settings.plan_tip_alias_pin"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_import"),
      tip: t("settings.plan_tip_alias_import"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_csv"),
      tip: t("settings.plan_tip_alias_csv"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_bulk"),
      tip: t("settings.plan_tip_alias_bulk"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_transfer"),
      tip: t("settings.plan_tip_alias_transfer"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: contacts,
      label: t("settings.plan_f_contacts"),
      free: unlimited,
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: contacts,
      label: t("settings.plan_f_contact_import"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: contacts,
      label: t("settings.plan_f_contact_sync"),
      tip: t("settings.plan_tip_contact_sync"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: contacts,
      label: t("settings.plan_f_contact_merge"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_pgp"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_key_management"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_custom_key_rotation"),
      tip: t("settings.plan_tip_key_rotation"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_wkd"),
      tip: t("settings.plan_tip_wkd"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.feature_two_factor"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_phishing"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_tracker_protection"),
      tip: t("settings.plan_tip_tracker_protection"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.feature_remote_image_blocking"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_link_warnings"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.feature_login_notifications"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_biometric"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: security,
      label: t("settings.plan_f_blocked_senders"),
      free: unlimited,
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: security,
      label: t("settings.plan_f_allowlist"),
      tip: t("settings.plan_tip_allowlist"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: vanguard,
      label: t("settings.plan_f_vanguard_app_lock"),
      tip: t("settings.plan_tip_vanguard_app_lock"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: vanguard,
      label: t("settings.plan_f_vanguard_lockdown_mode"),
      tip: t("settings.plan_tip_vanguard_lockdown_mode"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: subs,
      label: t("settings.plan_f_sub_scanner"),
      tip: t("settings.plan_tip_sub_scanner"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: subs,
      label: t("settings.plan_f_one_click_unsub"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: subs,
      label: t("settings.plan_f_sub_categories"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: support,
      label: t("settings.plan_f_support_priority"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
  ];
}

type ColumnKey = "free" | "star" | "nova" | "supernova";

const COLUMNS: ColumnKey[] = ["free", "star", "nova", "supernova"];

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

const CATEGORY_ICONS: [TranslationKey, HeroIcon][] = [
  ["settings.plan_cat_general", Squares2X2Icon],
  ["settings.plan_cat_mail", EnvelopeIcon],
  ["settings.plan_cat_advanced_aliases", AtSymbolIcon],
  ["settings.plan_cat_contacts", UserGroupIcon],
  ["settings.plan_cat_security", ShieldCheckIcon],
  ["settings.plan_cat_vanguard", LockClosedIcon],
  ["settings.plan_cat_subscriptions", NewspaperIcon],
  ["settings.plan_cat_support", LifebuoyIcon],
];

interface ComparisonGroup {
  category: string;
  rows: ComparisonRow[];
}

const ROW_CLASS =
  "@max-xl:flex-wrap @max-xl:gap-y-2.5 [&>:last-child]:max-w-none [&>:last-child]:shrink-0 [&>:last-child]:basis-[58%] @max-xl:[&>:last-child]:basis-full";

const VALUES_CLASS =
  "grid w-full grid-cols-4 items-center gap-x-1.5 @max-md:-mx-2 @max-md:w-[calc(100%+1rem)] @max-md:gap-x-1";

function group_rows(rows: ComparisonRow[]): ComparisonGroup[] {
  return rows.reduce<ComparisonGroup[]>((groups, row) => {
    const last = groups[groups.length - 1];

    if (last && last.category === row.category) {
      last.rows.push(row);
    } else {
      groups.push({ category: row.category, rows: [row] });
    }

    return groups;
  }, []);
}

function ComparisonCell({
  value,
  plan_label,
}: {
  value: string;
  plan_label: string;
}) {
  const { t } = use_i18n();

  if (value === "✓") {
    return (
      <>
        <CheckCircleIcon
          aria-hidden="true"
          className="mx-auto block h-[22px] w-[22px]"
          style={{ color: "var(--accent-blue)" }}
        />
        <span className="sr-only">
          {plan_label}: {t("settings.plan_compare_included")}
        </span>
      </>
    );
  }

  if (value === "-") {
    return (
      <>
        <XCircleIcon
          aria-hidden="true"
          className="mx-auto block h-[22px] w-[22px]"
          style={{ color: "var(--color-danger)", strokeWidth: 1.8 }}
        />
        <span className="sr-only">
          {plan_label}: {t("settings.plan_compare_not_included")}
        </span>
      </>
    );
  }

  return (
    <span className="block text-sm font-medium text-txt-primary @max-md:[font-size:calc(12px*var(--font-scale,1))]!">
      <span className="sr-only">{plan_label}: </span>
      {value}
    </span>
  );
}

function FeatureLabel({ label, tip }: { label: string; tip?: string }) {
  if (!tip) {
    return <>{label}</>;
  }

  const words = label.split(" ");
  const last_word = words.pop();
  const leading_words = words.join(" ");

  return (
    <span>
      {leading_words ? `${leading_words} ` : ""}
      <span className="whitespace-nowrap">
        {last_word}
        <span className="ms-1.5 inline-block translate-y-[3px]">
          <InfoPopover description={tip} title={label} />
        </span>
      </span>
    </span>
  );
}

export function PlanComparisonTable({
  highlight_plan_code,
  sticky_background = "var(--bg-primary)",
}: {
  highlight_plan_code?: string | null;
  sticky_background?: string;
}) {
  const { t } = use_i18n();
  const rows = useMemo<ComparisonRow[]>(() => get_plan_comparison_rows(t), [t]);
  const groups = useMemo(() => group_rows(rows), [rows]);
  const category_icons = useMemo(
    () =>
      new Map<string, HeroIcon>(
        CATEGORY_ICONS.map(([key, icon]) => [t(key), icon]),
      ),
    [t],
  );
  const column_labels: Record<ColumnKey, string> = {
    free: t("settings.plan_free"),
    star: "Star",
    nova: "Nova",
    supernova: "Supernova",
  };
  const active_column =
    COLUMNS.find((key) => key === highlight_plan_code) ?? null;

  return (
    <div className="@container">
      <div
        aria-hidden="true"
        className="sticky top-0 z-[1] flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: sticky_background }}
      >
        <span className="min-w-0 flex-1 @max-xl:hidden" />
        <div className="shrink-0 basis-[58%] @max-xl:basis-full">
          <div className={VALUES_CLASS}>
            {COLUMNS.map((key) => (
              <span
                key={key}
                className="truncate text-center text-[15px] font-semibold @max-md:[font-size:calc(12px*var(--font-scale,1))]!"
                style={{
                  color:
                    active_column === key
                      ? "var(--accent-blue)"
                      : "var(--text-primary)",
                }}
              >
                {column_labels[key]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <IslandSections className="pt-2">
        {groups.map((group) => {
          const Icon = category_icons.get(group.category);

          return (
            <IslandSection
              key={group.category}
              divided
              icon={Icon ? <Icon aria-hidden="true" /> : undefined}
              title={group.category}
            >
              {group.rows.map((row) => (
                <IslandRow
                  key={row.label}
                  className={ROW_CLASS}
                  label={<FeatureLabel label={row.label} tip={row.tip} />}
                  trailing={
                    <div className={VALUES_CLASS}>
                      {COLUMNS.map((key) => (
                        <div key={key} className="text-center tabular-nums">
                          <ComparisonCell
                            plan_label={column_labels[key]}
                            value={row[key]}
                          />
                        </div>
                      ))}
                    </div>
                  }
                />
              ))}
            </IslandSection>
          );
        })}
      </IslandSections>
    </div>
  );
}
