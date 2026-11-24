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
import type {
  SourceNotifyChoice,
  SourceNotifySetting,
} from "@/services/api/external_accounts";

import { useCallback, useEffect, useRef, useState } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import { use_external_sources } from "@/hooks/use_external_sources";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_source_notify,
  save_source_notify,
} from "@/services/api/external_accounts";
import {
  apply_notify_choice,
  notify_choice_for,
  type SourceOption,
} from "@/services/external_sources";

export interface SourceNotifyState {
  rows: SourceOption[];
  loaded: boolean;
  is_saving: boolean;
  choice_for: (source_id: string) => SourceNotifyChoice;
  set_choice: (source_id: string, notify: SourceNotifyChoice) => Promise<void>;
}

let cached_settings: SourceNotifySetting[] | null = null;

export function clear_source_notify_cache(): void {
  cached_settings = null;
}

export function use_source_notify(): SourceNotifyState {
  const { t } = use_i18n();
  const { options, loading } = use_external_sources();
  const [settings, set_settings] = useState<SourceNotifySetting[] | null>(
    () => cached_settings,
  );
  const [settings_settled, set_settings_settled] = useState(
    () => cached_settings !== null,
  );
  const [is_saving, set_is_saving] = useState(false);
  const is_mounted_ref = useRef(true);
  const settings_ref = useRef<SourceNotifySetting[]>(cached_settings ?? []);

  useEffect(() => {
    is_mounted_ref.current = true;

    void get_source_notify()
      .then((result) => {
        if (result.error) return null;

        return result.data ?? [];
      })
      .catch(() => null)
      .then((loaded) => {
        if (loaded !== null) cached_settings = loaded;
        if (!is_mounted_ref.current) return;
        set_settings_settled(true);
        if (loaded === null) return;
        settings_ref.current = loaded;
        set_settings(loaded);
      });

    return () => {
      is_mounted_ref.current = false;
    };
  }, []);

  const choice_for = useCallback(
    (source_id: string) => notify_choice_for(source_id, settings ?? []),
    [settings],
  );

  const set_choice = useCallback(
    async (source_id: string, notify: SourceNotifyChoice) => {
      if (settings === null) return;
      const previous = settings_ref.current;
      const next = apply_notify_choice(
        previous,
        source_id,
        notify,
        options.map((option) => option.value),
      );

      settings_ref.current = next;
      set_settings(next);
      set_is_saving(true);

      try {
        const result = await save_source_notify(next);

        if (result.error) throw new Error(result.error);
        cached_settings = next;
      } catch {
        settings_ref.current = previous;
        if (is_mounted_ref.current) set_settings(previous);
        show_toast(t("settings.ext_v2_notify_source_save_failed"), "error");
      } finally {
        if (is_mounted_ref.current) set_is_saving(false);
      }
    },
    [options, settings, t],
  );

  return {
    rows: loading || settings === null ? [] : options,
    loaded: !loading && settings_settled,
    is_saving,
    choice_for,
    set_choice,
  };
}
