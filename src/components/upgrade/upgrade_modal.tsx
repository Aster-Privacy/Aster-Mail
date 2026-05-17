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
import { useEffect, useMemo } from "react";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  close_upgrade_modal,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
  use_upgrade_state,
  type UpgradeLimitKey,
} from "@/stores/upgrade_store";

const LIMIT_LABEL_KEY: Record<UpgradeLimitKey, string> = {
  max_email_aliases: "settings.usage_aliases",
  max_custom_domains: "settings.usage_domains",
  max_contacts: "settings.usage_contacts",
  max_email_templates: "settings.usage_templates",
  max_html_signatures: "settings.usage_signatures",
  max_custom_filters: "settings.usage_filters",
  generic: "settings.upgrade_generic_resource",
};

function open_billing_settings() {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", { detail: "billing" }),
  );
}

export function UpgradeModal() {
  const { t } = use_i18n();
  const state = use_upgrade_state();
  const { limits, refresh } = use_plan_limits();

  useEffect(() => {
    function handle_plan_limit(e: Event) {
      const detail =
        (e as CustomEvent<{ resource?: string | null; message?: string | null }>)
          .detail || {};

      show_plan_limit_upgrade({
        resource: detail.resource ?? null,
        message: detail.message ?? null,
      });
    }

    function handle_storage_full(e: Event) {
      const detail =
        (e as CustomEvent<{ message?: string | null }>).detail || {};

      show_storage_full_upgrade({ message: detail.message ?? null });
    }

    window.addEventListener("aster:plan-limit-hit", handle_plan_limit);
    window.addEventListener("aster:storage-full", handle_storage_full);

    return () => {
      window.removeEventListener("aster:plan-limit-hit", handle_plan_limit);
      window.removeEventListener("aster:storage-full", handle_storage_full);
    };
  }, []);

  useEffect(() => {
    if (state.is_open) refresh();
  }, [state.is_open, refresh]);

  const is_storage = state.reason === "storage_full";

  const limit_info = useMemo(() => {
    if (!limits || state.limit_key === "generic") return null;

    return limits.limits[state.limit_key] ?? null;
  }, [limits, state.limit_key]);

  const plan_name = limits?.plan_name ?? null;

  const resource_label = state.limit_key
    ? t(LIMIT_LABEL_KEY[state.limit_key] as never) || state.resource_label
    : state.resource_label;

  const title = is_storage
    ? t("settings.storage_locked_title")
    : t("settings.upgrade_modal_title");

  const description = is_storage
    ? t("settings.storage_locked_description")
    : state.server_message && state.server_message.trim().length > 0
      ? state.server_message
      : limit_info && resource_label
        ? t("settings.upgrade_modal_description_specific", {
            resource: String(resource_label).toLowerCase(),
            plan: plan_name ?? "",
          })
        : t("settings.upgrade_modal_description_generic");

  const handle_upgrade = () => {
    close_upgrade_modal();
    requestAnimationFrame(open_billing_settings);
  };

  const handle_buy_storage = () => {
    close_upgrade_modal();
    requestAnimationFrame(open_billing_settings);
  };

  const storage = limits?.storage ?? null;
  const storage_percentage = storage
    ? Math.min(100, storage.percentage_used)
    : 0;

  const format_bytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit_index = 0;

    while (value >= 1024 && unit_index < units.length - 1) {
      value /= 1024;
      unit_index++;
    }

    return `${value.toFixed(value >= 10 || unit_index === 0 ? 0 : 1)} ${units[unit_index]}`;
  };

  return (
    <Modal
      is_open={state.is_open}
      size={is_storage ? "lg" : "md"}
      on_close={close_upgrade_modal}
    >
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {is_storage && storage ? (
          <div className="p-4 rounded-lg bg-surf-tertiary border border-edge-secondary">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-txt-primary">
                {t("settings.usage_storage")}
              </span>
              <span
                className="text-xs font-medium"
                style={{
                  color: storage.is_locked
                    ? "var(--destructive)"
                    : "var(--text-secondary)",
                }}
              >
                {format_bytes(storage.used_bytes)} /{" "}
                {format_bytes(storage.limit_bytes)}
              </span>
            </div>
            <Progress
              className={`h-1.5 ${storage.is_locked ? "[&>div]:bg-red-500" : storage.is_warning ? "[&>div]:bg-amber-500" : ""}`}
              value={storage_percentage}
            />
            {storage.days_until_permanent_bounce !== null &&
              storage.is_locked && (
                <p
                  className="text-xs mt-3"
                  style={{ color: "var(--destructive)" }}
                >
                  {t("settings.storage_locked_bounce_warning", {
                    days: String(storage.days_until_permanent_bounce),
                  })}
                </p>
              )}
          </div>
        ) : null}

        {!is_storage && limit_info ? (
          <div className="p-4 rounded-lg bg-surf-tertiary border border-edge-secondary">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-txt-primary">
                {resource_label}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--destructive)" }}
              >
                {t("settings.usage_of", {
                  current: String(limit_info.current),
                  limit:
                    limit_info.limit === -1
                      ? t("settings.usage_unlimited")
                      : String(limit_info.limit),
                })}
              </span>
            </div>
            <Progress
              className="h-1.5 [&>div]:bg-red-500"
              value={
                limit_info.limit > 0
                  ? Math.min(100, (limit_info.current / limit_info.limit) * 100)
                  : 100
              }
            />
          </div>
        ) : null}

        <ol className="space-y-2.5 text-[13px] text-txt-secondary">
          {[
            t("settings.upgrade_perk_storage"),
            t("settings.upgrade_perk_aliases"),
            t("settings.upgrade_perk_domains"),
            t("settings.upgrade_perk_features"),
          ].map((perk, idx) => (
            <li key={idx} className="flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{
                  backgroundColor: "var(--accent-blue)",
                  color: "white",
                }}
              >
                {idx + 1}
              </span>
              <span>{perk}</span>
            </li>
          ))}
        </ol>
      </ModalBody>

      <ModalFooter className="flex-row gap-3">
        {is_storage ? (
          <>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant="outline"
              onClick={handle_buy_storage}
            >
              {t("settings.upgrade_buy_storage")}
            </Button>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant="primary"
              onClick={handle_upgrade}
            >
              {t("settings.upgrade_view_plans")}
            </Button>
          </>
        ) : (
          <>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant="ghost"
              onClick={close_upgrade_modal}
            >
              {t("common.not_now")}
            </Button>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant="primary"
              onClick={handle_upgrade}
            >
              {t("settings.upgrade_view_plans")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
