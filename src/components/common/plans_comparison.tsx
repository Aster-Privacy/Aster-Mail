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

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CheckIcon,
  XMarkIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@aster/ui";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";

type PlanKey = "free" | "star" | "nova" | "supernova";

interface PlansComparisonProps {
  selected_plan: PlanKey;
  on_select: (plan: PlanKey) => void;
  on_back: () => void;
  on_continue: () => void;
}

interface FeatureRow {
  name: string;
  free: string | boolean;
  star: string | boolean;
  nova: string | boolean;
  supernova: string | boolean;
  category?: string;
}

interface PlanInfo {
  key: PlanKey;
  label: string;
  price: string;
  period: string;
}

function get_features(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): FeatureRow[] {
  const unlimited = t("settings.unlimited");

  return [
    {
      category: t("settings.category_storage_limits"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_secure_storage"),
      free: "10 GB",
      star: "15 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      name: t("settings.feature_max_attachment"),
      free: "25 MB",
      star: "50 MB",
      nova: "100 MB",
      supernova: "250 MB",
    },
    {
      name: t("settings.feature_daily_send_limit"),
      free: t("settings.feature_200_emails"),
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_email_retention"),
      free: unlimited,
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },

    {
      category: t("settings.category_email_features"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_e2e_encryption"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_zero_knowledge"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_email_aliases"),
      free: "5",
      star: "15",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_custom_domains"),
      free: "1",
      star: "5",
      nova: "30",
      supernova: unlimited,
    },
    {
      name: t("settings.feature_scheduled_sending"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_undo_send"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_read_receipts"),
      free: false,
      star: false,
      nova: false,
      supernova: true,
    },
    {
      name: t("settings.feature_email_templates"),
      free: "3",
      star: "10",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_auto_responder"),
      free: false,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.plan_f_alias_avatars"),
      free: false,
      star: true,
      nova: true,
      supernova: true,
    },

    {
      category: t("settings.category_organization"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.folders_limit"),
      free: "10",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_labels"),
      free: "15",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_smart_folders"),
      free: false,
      star: false,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_advanced_search"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.search_history"),
      free: t("settings.feature_30_days"),
      star: t("settings.feature_1_year"),
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_contacts"),
      free: "150",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      name: t("settings.feature_contact_groups"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },

    {
      category: t("settings.category_security_plans"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_two_factor"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_recovery_codes"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_password_folders"),
      free: false,
      star: false,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_session_management"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_login_notifications"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_encrypted_exports"),
      free: false,
      star: false,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_hardware_key"),
      free: false,
      star: false,
      nova: false,
      supernova: true,
    },

    {
      category: t("settings.category_privacy"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_no_ads"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_no_tracking"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_anonymous_signup"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_tor_support"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_link_tracking"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_remote_image_blocking"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },

    {
      category: t("settings.category_import_export"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_import_gmail"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_import_outlook"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_mbox_import"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_export_emails"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_export_contacts"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },

    {
      category: t("settings.category_support"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_help_center"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_community_forum"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_email_support"),
      free: false,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_priority_support"),
      free: false,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_response_time"),
      free: "-",
      star: t("settings.feature_48_hours"),
      nova: t("settings.feature_24_hours"),
      supernova: t("settings.feature_24_hours"),
    },

    {
      category: t("settings.category_apps_integrations"),
      name: "",
      free: "",
      star: "",
      nova: "",
      supernova: "",
    },
    {
      name: t("settings.feature_web_app"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_ios_app"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_android_app"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_desktop_app"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_browser_extension"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_imap_smtp"),
      free: true,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_caldav"),
      free: false,
      star: true,
      nova: true,
      supernova: true,
    },
    {
      name: t("settings.feature_api_access"),
      free: false,
      star: false,
      nova: false,
      supernova: true,
    },
  ];
}

function get_plans(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return [
    {
      key: "free" as const,
      label: "Free",
      price: "$0.00",
      period: t("settings.for_life"),
    },
    {
      key: "star" as const,
      label: "Star",
      price: "$2.99",
      period: t("settings.per_month"),
    },
    {
      key: "nova" as const,
      label: "Nova",
      price: "$8.99",
      period: t("settings.per_month"),
    },
    {
      key: "supernova" as const,
      label: "Supernova",
      price: "$17.99",
      period: t("settings.per_month"),
    },
  ];
}

function FeatureCheck({ included }: { included: boolean }) {
  if (included) {
    return (
      <CheckIcon
        className="w-5 h-5 mx-auto text-emerald-500"
        strokeWidth={2.5}
      />
    );
  }

  return (
    <XMarkIcon className="w-5 h-5 mx-auto text-txt-muted" strokeWidth={2} />
  );
}

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return <FeatureCheck included={value} />;
  }

  return <span className="text-sm text-txt-primary font-medium">{value}</span>;
}

function MobilePlanCard({
  plan,
  selected,
  on_select,
  all_features,
}: {
  plan: PlanInfo;
  selected: boolean;
  on_select: () => void;
  all_features: FeatureRow[];
}) {
  const plan_features = all_features.filter((f) => !f.category);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all border-2 bg-surf-card",
        selected
          ? "border-brand shadow-[0_0_0_1px_var(--color-brand),0_4px_12px_rgba(59,130,246,0.15)]"
          : "border-edge-primary",
      )}
      onClick={on_select}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div
              className={cn(
                "text-xs font-medium mb-1",
                plan["key"] === "free" ? "text-brand" : "text-txt-tertiary",
              )}
            >
              {plan.label}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-txt-primary">
                {plan.price}
              </span>
              <span className="text-sm text-txt-tertiary">{plan.period}</span>
            </div>
          </div>
          {selected && (
            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
              <CheckIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-edge-primary">
          {plan_features.slice(0, 8).map((feature, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-txt-secondary">{feature.name}</span>
              <span className="text-txt-primary font-medium">
                <FeatureValue value={feature[plan.key]} />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MobileFeatureCategory({
  category,
  feature_rows,
  selected_plan,
}: {
  category: string;
  feature_rows: FeatureRow[];
  selected_plan: PlanKey;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-txt-primary mb-3">
        {category}
      </h3>
      <div className="space-y-2">
        {feature_rows.map((row, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-2 border-b border-edge-primary"
          >
            <span className="text-sm text-txt-secondary">{row.name}</span>
            <span className="text-sm text-txt-primary font-medium">
              <FeatureValue value={row[selected_plan]} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlansComparison({
  selected_plan,
  on_select,
  on_back,
  on_continue,
}: PlansComparisonProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const translated_plans = useMemo(() => get_plans(t), [t]);
  const translated_features = useMemo(() => get_features(t), [t]);
  const selected_plan_label = useMemo(() => {
    const plan = translated_plans.find((p) => p.key === selected_plan);

    return plan?.label || "";
  }, [translated_plans, selected_plan]);
  const grouped_features = translated_features.reduce(
    (acc, row) => {
      if (row.category) {
        acc.push({ category: row.category, rows: [] });
      } else if (acc.length > 0) {
        acc[acc.length - 1].rows.push(row);
      }

      return acc;
    },
    [] as { category: string; rows: FeatureRow[] }[],
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex flex-col bg-surf-primary"
      initial={reduce_motion ? false : { opacity: 0 }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-edge-primary">
        <Button
          className="gap-1 md:gap-2 text-txt-tertiary px-2 md:px-4"
          variant="ghost"
          onClick={on_back}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span className="hidden sm:inline">
            {t("settings.back_to_plans")}
          </span>
          <span className="sm:hidden">{t("common.back")}</span>
        </Button>
        <h1 className="text-base md:text-lg font-semibold text-txt-primary hidden sm:block">
          {t("settings.compare_all_features")}
        </h1>
        <Button className="px-3 md:px-4 text-sm" onClick={on_continue}>
          <span className="hidden sm:inline">
            {t("settings.continue_with_plan", { plan: selected_plan_label })}
          </span>
          <span className="sm:hidden">{t("common.continue")}</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="md:hidden px-4 py-6">
          <h2 className="text-lg font-semibold text-txt-primary mb-4 text-center">
            {t("settings.select_your_plan")}
          </h2>
          <div className="space-y-3 mb-8">
            {translated_plans.map((plan) => (
              <MobilePlanCard
                key={plan.key}
                all_features={translated_features}
                on_select={() => on_select(plan.key)}
                plan={plan}
                selected={selected_plan === plan.key}
              />
            ))}
          </div>

          <h2 className="text-lg font-semibold text-txt-primary mb-4">
            {t("settings.plan_features", { plan: selected_plan_label })}
          </h2>
          {grouped_features.map((group, idx) => (
            <MobileFeatureCategory
              key={idx}
              category={group.category}
              feature_rows={group.rows}
              selected_plan={selected_plan}
            />
          ))}

          <div className="mt-8 text-center">
            <p className="text-sm mb-4 text-txt-tertiary">
              {t("settings.all_plans_include_privacy")}
            </p>
            <Button className="w-full" size="xl" onClick={on_continue}>
              {t("settings.continue_with_plan", { plan: selected_plan_label })}
            </Button>
          </div>
        </div>

        <div className="hidden md:block max-w-6xl mx-auto px-6 py-8">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-4 px-4 w-1/4">
                    <span className="text-sm font-medium text-txt-tertiary">
                      {t("settings.features")}
                    </span>
                  </th>
                  {translated_plans.map((plan) => (
                    <th
                      key={plan.key}
                      className="text-center py-4 px-2 w-[19%]"
                    >
                      <Card
                        className={cn(
                          "cursor-pointer transition-all border-2 bg-surf-card",
                          selected_plan === plan.key
                            ? "border-brand shadow-[0_0_0_1px_var(--color-brand),0_4px_12px_rgba(59,130,246,0.15)]"
                            : "border-edge-primary hover:border-edge-secondary",
                        )}
                        onClick={() => on_select(plan.key)}
                      >
                        <CardContent className="p-4">
                          <div
                            className={cn(
                              "text-xs font-medium mb-2",
                              plan["key"] === "free"
                                ? "text-brand"
                                : "text-txt-tertiary",
                            )}
                          >
                            {plan.label}
                          </div>
                          <div className="text-2xl font-bold text-txt-primary">
                            {plan.price}
                          </div>
                          <div className="text-sm text-txt-tertiary">
                            {plan.period}
                          </div>
                        </CardContent>
                      </Card>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {translated_features.map((row, index) => {
                  if (row.category) {
                    return (
                      <tr key={index}>
                        <td className="pt-8 pb-3 px-4" colSpan={5}>
                          <span className="text-sm font-semibold text-txt-primary">
                            {row.category}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={index} className="border-b border-edge-primary">
                      <td className="py-3 px-4">
                        <span className="text-sm text-txt-secondary">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.free} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.star} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.nova} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.supernova} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm mb-4 text-txt-tertiary">
              {t("settings.all_plans_include_privacy")}
              <br />
              {t("settings.upgrade_downgrade_anytime")}
            </p>
            <Button size="xl" onClick={on_continue}>
              {t("settings.continue_with_plan", { plan: selected_plan_label })}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
