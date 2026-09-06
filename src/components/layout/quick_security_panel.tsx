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
import type { SecurityCriterion } from "@/lib/security_criteria";

import { useCallback, useMemo, useRef } from "react";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Button, Spinner, Tooltip } from "@aster/ui";

import {
  SECURITY_LOCK_COLOR,
  SecurityLockIcon,
  security_status_from_percent,
} from "@/components/settings/security/security_lock_icon";
import {
  build_security_criteria,
  security_percent,
} from "@/lib/security_criteria";
import { use_security_overview } from "@/hooks/use_security_overview";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";

interface QuickSecurityPanelProps {
  is_open: boolean;
  is_top_inset: boolean;
  on_close: () => void;
}

function navigate_to(criterion: SecurityCriterion) {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", {
      detail: criterion.anchor
        ? { section: criterion.section, anchor: criterion.anchor }
        : criterion.section,
    }),
  );
}

export function QuickSecurityPanel({
  is_open,
  is_top_inset,
  on_close,
}: QuickSecurityPanelProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const overview = use_security_overview(is_open);
  const panel_ref = useRef<HTMLElement | null>(null);

  use_escape_layer(is_open, on_close, "quick_security_panel", false);
  use_panel_inset(is_open, panel_ref);

  const criteria = useMemo(
    () =>
      build_security_criteria({
        totp_enabled: overview.totp_enabled,
        passkey_registered: overview.passkey_registered,
        recovery_email_verified: overview.recovery_email_verified,
        login_alerts_enabled: overview.login_alerts_enabled,
        block_tracking_pixels: preferences.block_tracking_pixels,
        block_remote_images: preferences.block_remote_images,
        strip_exif_on_compose: preferences.strip_exif_on_compose,
      }),
    [
      overview.totp_enabled,
      overview.passkey_registered,
      overview.recovery_email_verified,
      overview.login_alerts_enabled,
      preferences.block_tracking_pixels,
      preferences.block_remote_images,
      preferences.strip_exif_on_compose,
    ],
  );

  const percent = security_percent(criteria);
  const status = security_status_from_percent(percent);
  const pending = criteria.filter((item) => !item.met);
  const done = criteria.filter((item) => item.met);

  const open_security = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "security" }),
    );
  }, []);

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.security_center")}
      className={`quick_security_panel me-1 mb-1 w-[min(320px,78vw)] flex-shrink-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:me-2 md:mb-2 md:w-[clamp(272px,23vw,320px)] md:rounded-xl ${
        is_open ? "flex" : "hidden"
      } ${is_top_inset ? "mt-1 md:mt-2" : ""}`}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-3 pe-2">
        <ShieldCheckIcon className="h-4 w-4 flex-shrink-0 text-[var(--icon-muted)]" />
        <h2 className="flex-1 truncate text-[15px] font-medium text-txt-primary">
          {t("common.security_center")}
        </h2>
        <Tooltip position="bottom" tip={t("common.refresh")}>
          <Button
            aria-label={t("common.refresh")}
            className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
            size="icon"
            variant="ghost"
            onClick={overview.reload}
          >
            <ArrowPathIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip position="bottom" tip={t("common.close")}>
          <Button
            aria-label={t("common.close")}
            className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
            size="icon"
            variant="ghost"
            onClick={on_close}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      {!overview.is_loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {overview.has_failed && (
            <button
              className="mb-2 flex w-full items-center gap-2 rounded-lg bg-surf-secondary px-3 py-2 text-start text-[12.5px] text-txt-secondary hover:bg-surf-tertiary"
              type="button"
              onClick={overview.reload}
            >
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1">
                {t("settings.failed_load_security_status")}
              </span>
              <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
            </button>
          )}
          <div className="rounded-xl border border-edge-secondary bg-surf-secondary px-3 py-3">
            <div className="flex items-start gap-2.5">
              <SecurityLockIcon className="mt-0.5 h-5 w-5" status={status} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-txt-primary">
                  {t("settings.account_security_percent_title", { percent })}
                </p>
                <p className="mt-0.5 text-[12.5px] text-txt-secondary">
                  {t(`settings.account_protection_hint_${status}`)}
                </p>
              </div>
            </div>
            <div
              aria-label={t("settings.account_protection_title")}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surf-tertiary"
              role="progressbar"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  backgroundColor: SECURITY_LOCK_COLOR[status],
                }}
              />
            </div>
          </div>
          {pending.length > 0 ? (
            <>
              <h3 className="mt-4 mb-1.5 px-1 text-[11.5px] font-medium tracking-wide text-txt-secondary uppercase">
                {t("settings.security_center_recommended")}
              </h3>
              <ul className="space-y-1">
                {pending.map((item) => (
                  <li key={item.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start hover:bg-surf-secondary"
                      type="button"
                      onClick={() => navigate_to(item)}
                    >
                      <span className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-edge-primary" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-txt-primary">
                        {t(item.label_key)}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-[var(--icon-muted)] rtl:rotate-180" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 px-1 text-[13px] text-txt-secondary">
              {t("settings.security_center_all_clear")}
            </p>
          )}
          {done.length > 0 && (
            <>
              <h3 className="mt-4 mb-1.5 px-1 text-[11.5px] font-medium tracking-wide text-txt-secondary uppercase">
                {t("settings.security_center_protected")}
              </h3>
              <ul className="space-y-1">
                {done.map((item) => (
                  <li key={item.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start hover:bg-surf-secondary"
                      type="button"
                      onClick={() => navigate_to(item)}
                    >
                      <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-txt-secondary">
                        {t(item.label_key)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button
            className="mt-4 w-full"
            size="sm"
            variant="secondary"
            onClick={open_security}
          >
            {t("settings.account_security_review_cta")}
          </Button>
        </div>
      )}
    </aside>
  );
}
