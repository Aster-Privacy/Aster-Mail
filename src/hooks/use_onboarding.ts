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
import { useState, useEffect, useCallback, useRef } from "react";

import {
  get_onboarding_state,
  update_onboarding_state,
  DEFAULT_ONBOARDING_STATE,
  type OnboardingState,
} from "@/services/api/onboarding";
import { use_auth } from "@/contexts/auth_context";

interface UseOnboardingReturn {
  state: OnboardingState | null;
  is_completed: boolean;
  is_skipped: boolean;
  is_loading: boolean;
  should_show_onboarding: boolean;
  advance_to_step: (step: number) => Promise<void>;
  complete_step: (step: number) => Promise<void>;
  skip_onboarding: () => Promise<void>;
  complete_onboarding: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function use_onboarding(): UseOnboardingReturn {
  const { vault } = use_auth();
  const [state, set_state] = useState<OnboardingState | null>(null);
  const [is_completed, set_is_completed] = useState(false);
  const [is_skipped, set_is_skipped] = useState(false);
  const [is_loading, set_is_loading] = useState(true);
  const [has_initialized, set_has_initialized] = useState(false);
  const pending_update_ref = useRef<NodeJS.Timeout | null>(null);
  const is_updating_ref = useRef(false);

  const fetch_onboarding_state = useCallback(async () => {
    if (!vault) {
      return;
    }

    if (localStorage.getItem("show_onboarding") !== "true") {
      set_is_loading(false);
      set_has_initialized(true);

      return;
    }

    try {
      const response = await get_onboarding_state(vault);

      set_state(response.data);
      set_is_completed(response.is_completed);
      set_is_skipped(response.is_skipped);
    } catch {
    } finally {
      set_is_loading(false);
      set_has_initialized(true);
    }
  }, [vault]);

  useEffect(() => {
    fetch_onboarding_state();
  }, [fetch_onboarding_state]);

  const debounced_update = useCallback(
    async (
      new_state: OnboardingState,
      is_completed?: boolean,
      is_skipped?: boolean,
    ) => {
      if (!vault || is_updating_ref.current) return;

      if (pending_update_ref.current) {
        clearTimeout(pending_update_ref.current);
      }

      pending_update_ref.current = setTimeout(async () => {
        is_updating_ref.current = true;

        try {
          await update_onboarding_state(
            new_state,
            vault,
            is_completed,
            is_skipped,
          );
        } catch {
        } finally {
          is_updating_ref.current = false;
        }
      }, 300);
    },
    [vault],
  );

  const advance_to_step = useCallback(
    async (step: number) => {
      if (!vault) return;

      const current_state = state || DEFAULT_ONBOARDING_STATE;
      const new_state: OnboardingState = {
        ...current_state,
        current_step: step,
        last_seen_step: Math.max(current_state.last_seen_step, step),
      };

      set_state(new_state);
      await debounced_update(new_state);
    },
    [vault, state, debounced_update],
  );

  const complete_step = useCallback(
    async (step: number) => {
      if (!vault) return;

      const current_state = state || DEFAULT_ONBOARDING_STATE;
      const completed_steps = current_state.completed_steps.includes(step)
        ? current_state.completed_steps
        : [...current_state.completed_steps, step].sort((a, b) => a - b);

      const new_state: OnboardingState = {
        ...current_state,
        completed_steps,
        last_seen_step: Math.max(current_state.last_seen_step, step),
      };

      set_state(new_state);
      await debounced_update(new_state);
    },
    [vault, state, debounced_update],
  );

  const skip_onboarding = useCallback(async () => {
    if (!vault) return;

    const current_state = state || DEFAULT_ONBOARDING_STATE;

    set_is_skipped(true);
    localStorage.removeItem("show_onboarding");

    if (pending_update_ref.current) {
      clearTimeout(pending_update_ref.current);
    }

    try {
      await update_onboarding_state(current_state, vault, false, true);
    } catch {
      return;
    }
  }, [vault, state]);

  const complete_onboarding = useCallback(async () => {
    if (!vault) return;

    const current_state = state || DEFAULT_ONBOARDING_STATE;

    set_is_completed(true);
    localStorage.removeItem("show_onboarding");

    if (pending_update_ref.current) {
      clearTimeout(pending_update_ref.current);
    }

    try {
      await update_onboarding_state(current_state, vault, true, false);
    } catch {
      return;
    }
  }, [vault, state]);

  const refresh = useCallback(async () => {
    set_is_loading(true);
    await fetch_onboarding_state();
  }, [fetch_onboarding_state]);

  useEffect(() => {
    return () => {
      if (pending_update_ref.current) {
        clearTimeout(pending_update_ref.current);
      }
    };
  }, []);

  const should_show_onboarding =
    has_initialized &&
    !is_loading &&
    !is_completed &&
    !is_skipped &&
    !!vault &&
    localStorage.getItem("show_onboarding") === "true";

  return {
    state,
    is_completed,
    is_skipped,
    is_loading,
    should_show_onboarding,
    advance_to_step,
    complete_step,
    skip_onboarding,
    complete_onboarding,
    refresh,
  };
}
