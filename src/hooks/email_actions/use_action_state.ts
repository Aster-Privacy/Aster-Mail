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
import type { InboxEmail } from "@/types/email";

import { useState, useCallback, useRef } from "react";

import {
  type ActionType,
  type ActionStates,
  type EmailActionsConfig,
  INITIAL_ACTION_STATE,
  INITIAL_ACTION_STATES,
} from "../email_action_types";

export interface ActionStateContext {
  action_states: ActionStates;
  set_action_loading: (action_type: ActionType, is_loading: boolean) => void;
  set_action_error: (action_type: ActionType, error: string) => void;
  clear_action_state: (action_type: ActionType) => void;
  create_pending_action: (
    id: string,
    action_type: ActionType,
    original_state: Partial<InboxEmail>,
  ) => void;
  remove_pending_action: (id: string, action_type: ActionType) => void;
  rollback_action: (id: string, action_type: ActionType) => void;
  bulk_abort_ref: React.MutableRefObject<AbortController>;
  config: EmailActionsConfig;
}

export function use_action_state(
  config: EmailActionsConfig,
): ActionStateContext {
  const [action_states, set_action_states] = useState<ActionStates>(
    INITIAL_ACTION_STATES,
  );
  const pending_actions = useRef<
    Map<
      string,
      {
        id: string;
        original_state: Partial<InboxEmail>;
        action_type: ActionType;
      }
    >
  >(new Map());
  const bulk_abort_ref = useRef<AbortController>(new AbortController());

  const set_action_loading = useCallback(
    (action_type: ActionType, is_loading: boolean): void => {
      set_action_states((prev) => ({
        ...prev,
        [action_type]: { ...prev[action_type], is_loading, error: null },
      }));
    },
    [],
  );

  const set_action_error = useCallback(
    (action_type: ActionType, error: string): void => {
      set_action_states((prev) => ({
        ...prev,
        [action_type]: { ...prev[action_type], is_loading: false, error },
      }));
      config.on_error?.(error, action_type);
    },
    [config.on_error],
  );

  const clear_action_state = useCallback((action_type: ActionType): void => {
    set_action_states((prev) => ({
      ...prev,
      [action_type]: { ...INITIAL_ACTION_STATE },
    }));
  }, []);

  const create_pending_action = useCallback(
    (
      id: string,
      action_type: ActionType,
      original_state: Partial<InboxEmail>,
    ): void => {
      const key = `${action_type}-${id}`;

      pending_actions.current.set(key, { id, original_state, action_type });
    },
    [],
  );

  const remove_pending_action = useCallback(
    (id: string, action_type: ActionType): void => {
      const key = `${action_type}-${id}`;

      pending_actions.current.delete(key);
    },
    [],
  );

  const rollback_action = useCallback(
    (id: string, action_type: ActionType): void => {
      const key = `${action_type}-${id}`;
      const pending = pending_actions.current.get(key);

      if (pending) {
        config.on_optimistic_update?.(id, pending.original_state);
        pending_actions.current.delete(key);
      }
    },
    [config.on_optimistic_update],
  );

  return {
    action_states,
    set_action_loading,
    set_action_error,
    clear_action_state,
    create_pending_action,
    remove_pending_action,
    rollback_action,
    bulk_abort_ref,
    config,
  };
}
