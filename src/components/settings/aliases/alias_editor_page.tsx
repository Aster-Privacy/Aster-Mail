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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";

import { useMemo } from "react";
import {
  ArrowLeftIcon,
  AtSymbolIcon,
  ChartBarIcon,
  IdentificationIcon,
  InboxArrowDownIcon,
  LockClosedIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Switch, UpgradeBtn } from "@aster/ui";

import { format_created_at } from "./alias_stats_format";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { update_alias } from "@/services/api/aliases";
import { show_toast } from "@/components/toast/simple_toast";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import {
  FEATURE_MIN_PLAN,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import {
  AliasDetailsPanel,
  ContactsPanel,
  DeliveryLogPanel,
  DeliveryPanel,
  RulesPanel,
  SenderPinningPanel,
  StatsPanel,
  type AliasDeliveryState,
} from "@/components/settings/aliases/alias_advanced_panel";

interface EditorSection {
  key: string;
  label: string;
  icon: typeof IdentificationIcon;
  locked: boolean;
  feature: string;
  render: () => React.ReactNode;
}

interface AliasEditorPageProps {
  alias?: DecryptedEmailAlias;
  domain_address?: DecryptedDomainAddress & { domain_name: string };
  toggling?: boolean;
  on_back: () => void;
  on_toggle_enabled?: (alias_id: string, enabled: boolean) => void;
  on_display_name_saved?: (alias_id: string, name: string) => void;
  on_note_saved?: (alias_id: string, note: string) => void;
  on_websites_saved?: (alias_id: string, websites: string[]) => void;
  on_delivery_saved?: (alias_id: string, value: AliasDeliveryState) => void;
}

function SectionHeading({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof IdentificationIcon;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <Icon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {title}
        </h3>
        {action}
      </div>
      <div className="mt-2 h-px bg-edge-secondary" />
    </div>
  );
}

export function AliasEditorPage({
  alias,
  domain_address,
  toggling,
  on_back,
  on_toggle_enabled,
  on_display_name_saved,
  on_note_saved,
  on_websites_saved,
  on_delivery_saved,
}: AliasEditorPageProps) {
  const { t, language } = use_i18n();
  const { is_feature_locked, is_loading } = use_plan_limits();

  const sender_locked = is_feature_locked("has_sender_pinning");
  const rules_locked = is_feature_locked("has_alias_rules");
  const advanced_locked = is_feature_locked("has_advanced_aliases");
  const contacts_locked = is_feature_locked("max_reverse_contacts_per_alias");
  const avatar_locked = is_feature_locked("has_alias_avatars");

  const alias_id = alias?.id;
  const domain_address_id = domain_address?.id;
  const heading = alias
    ? alias.full_address
    : `${domain_address?.local_part}@${domain_address?.domain_name}`;
  const created_label = alias
    ? format_created_at(alias.created_at, language)
    : "";

  const sections = useMemo<EditorSection[]>(() => {
    const entries: EditorSection[] = [];

    if (alias) {
      entries.push({
        key: "details",
        icon: IdentificationIcon,
        label: t("settings.alias_details_title"),
        locked: false,
        feature: "has_alias_avatars",
        render: () => (
          <AliasDetailsPanel
            alias_address={alias.full_address}
            display_name={alias.display_name}
            is_locked={avatar_locked}
            note={alias.note}
            on_save_display_name={(name) =>
              update_alias(alias.id, { display_name: name })
            }
            on_save_note={(note_value) =>
              update_alias(alias.id, { note: note_value || null })
            }
            on_save_websites={(websites_value) =>
              update_alias(alias.id, {
                websites: websites_value.length > 0 ? websites_value : null,
              })
            }
            on_saved_display_name={(name) =>
              on_display_name_saved?.(alias.id, name)
            }
            on_saved_note={(note_value) =>
              on_note_saved?.(alias.id, note_value)
            }
            on_saved_websites={(websites_value) =>
              on_websites_saved?.(alias.id, websites_value)
            }
            websites={alias.websites}
          />
        ),
      });

      entries.push({
        key: "delivery",
        icon: InboxArrowDownIcon,
        label: t("settings.alias_delivery_title"),
        locked: false,
        feature: "has_advanced_aliases",
        render: () => (
          <DeliveryPanel
            delivery_folder_token={alias.delivery_folder_token}
            never_inbox={alias.never_inbox}
            on_save={(value) => update_alias(alias.id, value)}
            on_saved={(value) => on_delivery_saved?.(alias.id, value)}
          />
        ),
      });

      entries.push({
        key: "stats",
        icon: ChartBarIcon,
        label: t("settings.alias_stats_title"),
        locked: advanced_locked,
        feature: "has_advanced_aliases",
        render: () => (
          <StatsPanel
            hide_created
            alias_id={alias.id}
            locked={advanced_locked}
          />
        ),
      });
    }

    entries.push({
      key: "pins",
      icon: ShieldCheckIcon,
      label: t("settings.alias_sender_pinning_title"),
      locked: sender_locked,
      feature: "has_sender_pinning",
      render: () => (
        <SenderPinningPanel
          alias_id={alias_id}
          domain_address_id={domain_address_id}
          locked={sender_locked}
        />
      ),
    });

    entries.push({
      key: "rules",
      icon: SparklesIcon,
      label: t("settings.alias_rules_title"),
      locked: rules_locked,
      feature: "has_alias_rules",
      render: () => (
        <RulesPanel
          alias_id={alias_id}
          domain_address_id={domain_address_id}
          locked={rules_locked}
        />
      ),
    });

    entries.push({
      key: "blocked",
      icon: NoSymbolIcon,
      label: t("settings.alias_delivery_log_title"),
      locked: advanced_locked,
      feature: "has_advanced_aliases",
      render: () => (
        <DeliveryLogPanel
          alias_id={alias_id}
          domain_address_id={domain_address_id}
          locked={advanced_locked}
        />
      ),
    });

    entries.push({
      key: "contacts",
      icon: UserGroupIcon,
      label: t("settings.alias_contacts_title"),
      locked: contacts_locked,
      feature: "max_reverse_contacts_per_alias",
      render: () => (
        <ContactsPanel
          alias_domain={domain_address?.domain_name}
          alias_id={alias_id}
          alias_local_part={domain_address?.local_part}
          domain_address_id={domain_address_id}
          locked={contacts_locked}
        />
      ),
    });

    return entries;
  }, [
    advanced_locked,
    alias,
    alias_id,
    avatar_locked,
    contacts_locked,
    domain_address,
    domain_address_id,
    on_delivery_saved,
    on_display_name_saved,
    on_note_saved,
    on_websites_saved,
    rules_locked,
    sender_locked,
    t,
  ]);

  const open_sections = sections.filter((section) => !section.locked);
  const locked_sections = sections.filter((section) => section.locked);
  const locked_feature =
    locked_sections.length > 0
      ? locked_sections
          .map((section) => section.feature)
          .sort(
            (a, b) =>
              PLAN_TIERS.findIndex(
                (tier) => tier.id === (FEATURE_MIN_PLAN[a] ?? a),
              ) -
              PLAN_TIERS.findIndex(
                (tier) => tier.id === (FEATURE_MIN_PLAN[b] ?? b),
              ),
          )[0]
      : undefined;

  const copy_address = async () => {
    try {
      await navigator.clipboard.writeText(heading);
      show_toast(t("common.email_copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  if (is_loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        className="-ml-2 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-txt-secondary transition-colors hover:bg-surf-hover hover:text-txt-primary"
        type="button"
        onClick={on_back}
      >
        <ArrowLeftIcon className="h-4 w-4 shrink-0" />
        {t("common.back")}
      </button>

      <div className="rounded-[16px] border border-edge-secondary bg-surf-secondary px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surf-hover">
            <AtSymbolIcon className="h-[18px] w-[18px] text-txt-secondary" />
          </span>
          <div className="min-w-0 flex-1">
            <button
              className="block w-full min-w-0 truncate text-left text-[15px] font-semibold text-txt-primary transition-colors hover:text-txt-secondary"
              title={t("common.copy_address")}
              type="button"
              onClick={copy_address}
            >
              {heading}
            </button>
            {alias && (
              <p className="mt-0.5 truncate text-[12px] text-txt-muted">
                {alias.is_enabled ? t("common.active") : t("common.inactive")}
                {created_label
                  ? ` · ${t("settings.alias_stats_created", { date: created_label })}`
                  : ""}
              </p>
            )}
          </div>
          {alias && on_toggle_enabled && (
            <Switch
              aria-label={heading}
              checked={alias.is_enabled}
              disabled={toggling}
              size="lg"
              onCheckedChange={(next) => on_toggle_enabled(alias.id, next)}
            />
          )}
        </div>
      </div>

      {open_sections.map((section) => (
        <div key={section.key}>
          <SectionHeading icon={section.icon} title={section.label} />
          {section.render()}
        </div>
      ))}

      {locked_sections.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[16px] border border-edge-secondary bg-surf-secondary px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surf-hover">
                <LockClosedIcon className="h-[18px] w-[18px] text-txt-secondary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-txt-primary">
                  {t("settings.upgrade_to_unlock")}
                </p>
                <p className="mt-0.5 text-sm text-txt-muted">
                  {locked_sections.map((section) => section.label).join(" · ")}
                </p>
              </div>
            </div>

            <UpgradeBtn
              className="w-full flex-shrink-0 sm:w-auto"
              size="sm"
              onClick={() =>
                prompt_upgrade(
                  t("settings.feature_requires_upgrade"),
                  undefined,
                  locked_feature,
                )
              }
            >
              {t("settings.alias_feature_locked_upgrade_cta")}
            </UpgradeBtn>
          </div>

          {locked_sections.map((section) => (
            <div
              key={section.key}
              aria-hidden="true"
              className="pointer-events-none select-none opacity-50"
            >
              <SectionHeading icon={section.icon} title={section.label} />
              <fieldset disabled className="min-w-0 border-0 p-0 m-0">
                {section.render()}
              </fieldset>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
