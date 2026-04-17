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
import {
  type EmailActionsConfig,
  type UseEmailActionsReturn,
} from "../email_action_types";

import { use_action_state } from "./use_action_state";
import { use_metadata_helpers } from "./use_metadata_helpers";
import { use_single_actions } from "./use_single_actions";
import { use_bulk_actions } from "./use_bulk_actions";
import { use_utility_actions } from "./use_utility_actions";

export function use_email_actions(
  config: EmailActionsConfig = {},
): UseEmailActionsReturn {
  const state_ctx = use_action_state(config);
  const metadata = use_metadata_helpers();
  const single = use_single_actions(state_ctx, metadata);
  const bulk = use_bulk_actions(state_ctx, metadata);
  const utility = use_utility_actions(state_ctx);

  const is_any_action_loading = Object.values(state_ctx.action_states).some(
    (state) => state.is_loading,
  );

  return {
    action_states: state_ctx.action_states,
    is_any_action_loading,
    ...single,
    ...bulk,
    ...utility,
  };
}
