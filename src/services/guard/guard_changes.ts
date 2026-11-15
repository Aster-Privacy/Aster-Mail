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
import type { ApiResponse } from "@/services/api/client/helpers";
import type { StepUpProof } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import { GUARD_ACTION, id_subject } from "@/lib/crypto/guard_action";
import {
  cancel_guard_change,
  remove_guard_device,
  skip_guard_change,
} from "@/services/api/guard";
import { sign_guard_action } from "@/services/guard/sign_action";

export async function cancel_held_change(
  device: GuardDevice,
  user_id: string,
  change_id: string,
): Promise<ApiResponse<{ status: string }>> {
  const action = await sign_guard_action(
    device,
    user_id,
    GUARD_ACTION.cancel,
    id_subject(change_id),
  );

  return cancel_guard_change(change_id, action);
}

export async function skip_held_change(
  device: GuardDevice,
  user_id: string,
  change_id: string,
  proof: StepUpProof,
): Promise<ApiResponse<{ status: string }>> {
  const action = await sign_guard_action(
    device,
    user_id,
    GUARD_ACTION.skip,
    id_subject(change_id),
    proof,
  );

  return skip_guard_change(change_id, action, proof);
}

export async function remove_approver_device(
  device: GuardDevice,
  user_id: string,
  device_id: string,
): Promise<ApiResponse<{ status: string }>> {
  const action = await sign_guard_action(
    device,
    user_id,
    GUARD_ACTION.remove_device,
    id_subject(device_id),
  );

  return remove_guard_device(device_id, action);
}
