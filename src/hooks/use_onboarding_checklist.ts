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

import { use_auth } from "@/contexts/auth_context";
import {
  dismiss_onboarding_checklist,
  fetch_onboarding_checklist,
  type ChecklistState,
} from "@/services/api/onboarding";

const INSTALL_APP_STORAGE_KEY = "aster_onboarding_install_app_done";
const POLL_INTERVAL_MS = 20_000;

interface UseOnboardingChecklistReturn {
  state: ChecklistState | null;
  is_loading: boolean;
  dismiss: () => Promise<void>;
  refresh: () => Promise<void>;
  mark_install_app_done: () => void;
}

function read_install_app_flag(): boolean {
  try {
    return localStorage.getItem(INSTALL_APP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function apply_local_overrides(raw: ChecklistState): ChecklistState {
  return {
    ...raw,
    tasks: {
      ...raw.tasks,
      install_app: raw.tasks.install_app || read_install_app_flag(),
    },
  };
}

export function use_onboarding_checklist(): UseOnboardingChecklistReturn {
  const { vault } = use_auth();
  const [state, set_state] = useState<ChecklistState | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const cancelled_ref = useRef(false);
  const disabled_ref = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (disabled_ref.current) return false;
    const result = await fetch_onboarding_checklist();

    if (cancelled_ref.current) return false;
    if (!result) {
      disabled_ref.current = true;
      set_state(null);
      return false;
    }
    set_state(apply_local_overrides(result));
    return true;
  }, []);

  useEffect(() => {
    cancelled_ref.current = false;
    disabled_ref.current = false;

    if (!vault) {
      set_is_loading(false);
      return () => {
        cancelled_ref.current = true;
      };
    }

    let interval: number | undefined;
    let on_focus: (() => void) | undefined;

    (async () => {
      const ok = await load();
      if (cancelled_ref.current) return;
      set_is_loading(false);
      if (!ok) return;

      on_focus = () => {
        if (!disabled_ref.current) void load();
      };
      interval = window.setInterval(() => {
        if (disabled_ref.current) {
          window.clearInterval(interval!);
          return;
        }
        void load();
      }, POLL_INTERVAL_MS);
      window.addEventListener("focus", on_focus);
    })();

    return () => {
      cancelled_ref.current = true;
      if (on_focus) window.removeEventListener("focus", on_focus);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [vault, load]);

  const dismiss = useCallback(async () => {
    set_state((prev) =>
      prev ? { ...prev, dismissed_at: new Date().toISOString() } : prev,
    );
    await dismiss_onboarding_checklist();
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const mark_install_app_done = useCallback(() => {
    try {
      localStorage.setItem(INSTALL_APP_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    set_state((prev) =>
      prev ? { ...prev, tasks: { ...prev.tasks, install_app: true } } : prev,
    );
  }, []);

  return { state, is_loading, dismiss, refresh, mark_install_app_done };
}
