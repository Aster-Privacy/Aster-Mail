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
import { is_resumable_checkout_plan } from "@/components/settings/billing/billing_constants";

export const REQUESTED_PLAN_PARAM = "plan";

export function read_requested_plan(search: string): string | null {
  const plan = new URLSearchParams(search).get(REQUESTED_PLAN_PARAM);

  return is_resumable_checkout_plan(plan) ? plan : null;
}

export function initial_requested_plan(): string | null {
  if (typeof window === "undefined") return null;

  return read_requested_plan(window.location.search);
}

export function strip_requested_plan(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  if (!url.searchParams.has(REQUESTED_PLAN_PARAM)) return;
  url.searchParams.delete(REQUESTED_PLAN_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function should_open_requested_plan(
  requested: string | null,
  current_plan_code: string | null | undefined,
): boolean {
  return !!requested && requested !== current_plan_code;
}
