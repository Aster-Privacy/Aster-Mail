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
import type { StorageAddonItem } from "@/services/api/billing";
import type { TranslationKey } from "@/lib/i18n/types";

import { useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ExclamationCircleIcon } from "@heroicons/react/24/solid";

import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { format_bytes } from "@/lib/utils";
import { is_onion_host } from "@/lib/onion_host";
import { ignore_error } from "@/lib/ignore_error";
import { show_storage_full_upgrade } from "@/stores/upgrade_store";
import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import { get_storage_addons, format_price } from "@/services/api/billing";
import {
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import {
  dismiss_storage_nudge,
  is_storage_nudge_dismissed,
  pick_storage_offer,
  storage_nudge_tier,
  storage_percent,
  type StorageNudgeTier,
} from "@/components/email/inbox/storage_nudge";

interface StorageBannerProps {
  storage_used_bytes: number;
  storage_total_bytes: number;
}

const TITLE_KEY: Record<StorageNudgeTier, TranslationKey> = {
  almost: "settings.storage_nudge_almost_title",
  critical: "settings.storage_nudge_critical_title",
  full: "settings.storage_nudge_full_title",
};

const ACCENT_COLOR: Record<StorageNudgeTier, string> = {
  almost: "var(--accent-color)",
  critical: "#d97706",
  full: "#dc2626",
};

export function StorageBanner({
  storage_used_bytes,
  storage_total_bytes,
}: StorageBannerProps) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const account_id = user?.id ?? null;
  const percent = storage_percent(storage_used_bytes, storage_total_bytes);
  const tier = storage_nudge_tier(percent);
  const can_buy = !is_onion_host();
  const [addons, set_addons] = useState<StorageAddonItem[]>([]);
  const [dismissed, set_dismissed] = useState<{
    tier: StorageNudgeTier;
    account_id: string | null;
  } | null>(null);

  const is_dismissed = useMemo(
    () =>
      tier !== null &&
      ((dismissed?.tier === tier && dismissed.account_id === account_id) ||
        is_storage_nudge_dismissed(tier, account_id)),
    [tier, dismissed, account_id],
  );

  const should_load_offer = tier !== null && !is_dismissed && can_buy;

  useEffect(() => {
    if (!should_load_offer) return;

    let cancelled = false;

    get_storage_addons()
      .then((response) => {
        if (cancelled) return;
        set_addons(response.data?.available_addons ?? []);
      })
      .catch((error: unknown) => {
        ignore_error("inbox_storage_banner:load_addons", error);
      });

    return () => {
      cancelled = true;
    };
  }, [should_load_offer]);

  const offer = useMemo(
    () => pick_storage_offer(addons, storage_used_bytes, storage_total_bytes),
    [addons, storage_used_bytes, storage_total_bytes],
  );

  const offer_text = useMemo(() => {
    if (!offer) return t("settings.storage_nudge_offer_generic");

    const currency = detect_currency_from_locale();

    return t("settings.storage_nudge_offer", {
      size: offer.name,
      price: format_price(convert_cents(offer.price_cents, currency), currency),
    });
  }, [offer, t]);

  if (tier === null || is_dismissed) return null;

  const handle_dismiss = () => {
    dismiss_storage_nudge(tier, account_id);
    set_dismissed({ tier, account_id });
  };

  const handle_free_up = () => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "storage" }),
    );
  };

  const handle_get_storage = () => {
    if (!can_buy || !offer) {
      show_storage_full_upgrade({});

      return;
    }

    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "storage" }),
    );
    scroll_to_storage_addons();
  };

  const accent = ACCENT_COLOR[tier];
  const bar_percent = Math.min(100, Math.max(0, percent));
  const usage_text = t("settings.storage_used_of_total", {
    used: format_bytes(storage_used_bytes),
    total: format_bytes(storage_total_bytes),
  });

  return (
    <section
      aria-label={t(TITLE_KEY[tier])}
      className="mx-3 mt-2 mb-1 rounded-xl border border-edge-secondary bg-surf-secondary py-3 pl-4 pr-3"
      data-testid="storage-nudge"
      data-tier={tier}
      role={tier === "full" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ExclamationCircleIcon
              aria-hidden
              className="h-4 w-4 flex-shrink-0"
              style={{ color: accent }}
            />
            <p className="text-xs font-medium text-txt-secondary">
              {t(TITLE_KEY[tier])}
            </p>
          </div>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-txt-primary">
            {offer_text}
          </p>
          <p className="mt-0.5 text-xs text-txt-muted">
            {tier === "full"
              ? t("settings.storage_nudge_full_body")
              : t("settings.storage_nudge_body")}
          </p>
        </div>
        {tier !== "full" && (
          <button
            aria-label={t("common.dismiss")}
            className="-mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-surf-tertiary hover:text-txt-primary"
            type="button"
            onClick={handle_dismiss}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
        <div className="min-w-0 flex-1">
          <div
            aria-label={usage_text}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(bar_percent)}
            className="h-1 w-full overflow-hidden rounded-full bg-edge-secondary"
            role="progressbar"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${bar_percent}%`, backgroundColor: accent }}
            />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: accent }}>
            {usage_text}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button size="md" variant="outline" onClick={handle_free_up}>
            {t("settings.storage_nudge_free_up")}
          </Button>
          <Button size="md" variant="depth" onClick={handle_get_storage}>
            {t("settings.storage_nudge_get_storage")}
          </Button>
        </div>
      </div>
    </section>
  );
}
