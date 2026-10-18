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
  DEFAULT_CHECKLIST_TASKS,
  dismiss_onboarding_checklist,
  fetch_onboarding_checklist,
  type ChecklistState,
  type ChecklistTasksState,
} from "@/services/api/onboarding";

function with_dismissal_guard(
  raw: ChecklistState,
  dismissed: boolean,
): ChecklistState {
  if (dismissed && !raw.dismissed_at) {
    return { ...raw, dismissed_at: new Date().toISOString() };
  }

  return raw;
}

function is_checklist_settled(state: ChecklistState | null): boolean {
  if (!state) return false;
  if (state.dismissed_at) return true;

  return (
    Object.keys(DEFAULT_CHECKLIST_TASKS) as (keyof ChecklistTasksState)[]
  ).every((key) => state.tasks[key] === true);
}

const INSTALL_APP_STORAGE_KEY = "aster_onboarding_install_app_done";
const POLL_INTERVAL_MS = 20_000;

interface UseOnboardingChecklistReturn {
  state: ChecklistState | null;
  is_loading: boolean;
  account_id: string | null;
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
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const [state, set_state] = useState<ChecklistState | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const generation_ref = useRef(0);
  const disabled_ref = useRef(false);
  const dismissed_ref = useRef(false);
  const settled_ref = useRef(false);

  useEffect(() => {
    settled_ref.current = is_checklist_settled(state);
  }, [state]);

  const load = useCallback(async (): Promise<boolean> => {
    if (disabled_ref.current) return false;
    const generation = generation_ref.current;
    const result = await fetch_onboarding_checklist();

    if (generation !== generation_ref.current) return false;
    if (result.kind === "not_available") {
      disabled_ref.current = true;
      set_state(null);

      return false;
    }
    if (result.kind === "transient") {
      return true;
    }
    set_state(
      apply_local_overrides(
        with_dismissal_guard(result.state, dismissed_ref.current),
      ),
    );

    return true;
  }, []);

  useEffect(() => {
    generation_ref.current += 1;
    disabled_ref.current = false;
    dismissed_ref.current = false;

    const generation = generation_ref.current;

    set_state(null);

    if (!vault) {
      set_is_loading(false);

      return () => {
        generation_ref.current += 1;
      };
    }

    set_is_loading(true);

    let interval: number | undefined;
    let on_focus: (() => void) | undefined;

    (async () => {
      const ok = await load();

      if (generation !== generation_ref.current) return;
      set_is_loading(false);
      if (!ok) return;

      on_focus = () => {
        if (
          disabled_ref.current ||
          settled_ref.current ||
          dismissed_ref.current
        ) {
          return;
        }
        void load();
      };
      interval = window.setInterval(() => {
        if (disabled_ref.current) {
          window.clearInterval(interval!);

          return;
        }
        if (settled_ref.current || dismissed_ref.current) return;
        if (document.visibilityState === "hidden") return;
        void load();
      }, POLL_INTERVAL_MS);
      window.addEventListener("focus", on_focus);
    })();

    return () => {
      generation_ref.current += 1;
      if (on_focus) window.removeEventListener("focus", on_focus);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [vault, account_id, load]);

  const dismiss = useCallback(async () => {
    const was_dismissed = dismissed_ref.current;
    const generation = generation_ref.current;

    dismissed_ref.current = true;
    set_state((prev) =>
      prev ? { ...prev, dismissed_at: new Date().toISOString() } : prev,
    );

    const ok = await dismiss_onboarding_checklist();

    if (ok || generation !== generation_ref.current) return;
    dismissed_ref.current = was_dismissed;
    set_state((prev) => (prev ? { ...prev, dismissed_at: null } : prev));
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

  return {
    state,
    is_loading,
    account_id,
    dismiss,
    refresh,
    mark_install_app_done,
  };
}
