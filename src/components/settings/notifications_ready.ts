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
export interface NotificationsReadyState {
  product_updates_settled: boolean;
  offers_loaded: boolean;
  source_notify_loaded: boolean;
  permission_settled: boolean;
  plan_pending: boolean;
}

export function notifications_section_ready(
  state: NotificationsReadyState,
): boolean {
  return (
    state.product_updates_settled &&
    state.offers_loaded &&
    state.source_notify_loaded &&
    state.permission_settled &&
    !state.plan_pending
  );
}

export function is_plan_pending(
  limits: unknown,
  is_loading: boolean,
  load_failed: boolean,
): boolean {
  return limits === null && is_loading && !load_failed;
}

export function wants_product_updates_unsubscribe(search: string): boolean {
  return new URLSearchParams(search).get("unsubscribe") === "product_updates";
}
