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
import { useCallback, useEffect, useRef, useState } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_offer_preferences,
  set_offer_preferences,
} from "@/services/api/offers";
import {
  restore_special_offer_status,
  suppress_special_offer_status,
} from "@/stores/special_offer_status";

export interface OfferPreferencesState {
  enabled: boolean | null;
  loaded: boolean;
  busy: boolean;
  toggle: (next: boolean) => Promise<void>;
}

let cached_enabled: { value: boolean | null } | null = null;

export function clear_offer_preferences_cache(): void {
  cached_enabled = null;
}

function apply_offer_visibility(enabled: boolean) {
  if (enabled) {
    void restore_special_offer_status();

    return;
  }

  suppress_special_offer_status();
}

export function use_offer_preferences(): OfferPreferencesState {
  const { t } = use_i18n();
  const [enabled, set_enabled] = useState<boolean | null>(
    () => cached_enabled?.value ?? null,
  );
  const [loaded, set_loaded] = useState(() => cached_enabled !== null);
  const [busy, set_busy] = useState(false);
  const busy_ref = useRef(false);

  useEffect(() => {
    let cancelled = false;

    get_offer_preferences()
      .then((preferences) => {
        const value = preferences?.in_app_offers_enabled ?? null;

        if (value !== null) cached_enabled = { value };
        if (cancelled) return;
        set_enabled(value);
        set_loaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        set_enabled(null);
        set_loaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy_ref.current || enabled === null || next === enabled) return;

      const previous = enabled;

      busy_ref.current = true;
      set_busy(true);
      set_enabled(next);

      if (!next) suppress_special_offer_status();

      try {
        const saved = await set_offer_preferences(next);

        cached_enabled = { value: saved.in_app_offers_enabled };
        set_enabled(saved.in_app_offers_enabled);

        if (saved.in_app_offers_enabled || next) {
          apply_offer_visibility(saved.in_app_offers_enabled);
        }
      } catch {
        set_enabled(previous);
        show_toast(t("settings.special_offers_save_failed"), "error");

        if (previous) apply_offer_visibility(previous);
      } finally {
        busy_ref.current = false;
        set_busy(false);
      }
    },
    [enabled, t],
  );

  return { enabled, loaded, busy, toggle };
}
