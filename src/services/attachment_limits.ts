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
import { get_available_plans, get_current_plan } from "@/services/api/billing";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

export const FREE_MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
export const MAX_PAID_ATTACHMENT_SIZE = 250 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_SEND = 50;

const CACHE_TTL_MS = 300_000;

const UPGRADE_PLAN_CODES = ["star", "nova", "supernova"];

export interface PlanAttachmentLimit {
  code: string;
  max_bytes: number;
}

let cached_max_bytes = FREE_MAX_ATTACHMENT_SIZE;
let cached_upgrade_max_bytes = MAX_PAID_ATTACHMENT_SIZE;
let cached_plan_limits: PlanAttachmentLimit[] = [];
let cache_timestamp = 0;
let in_flight: Promise<number> | null = null;

export function get_max_attachment_size(): number {
  return cached_max_bytes;
}

export function get_upgrade_attachment_size(): number {
  return cached_upgrade_max_bytes;
}

export function get_upgrade_target(
  needed_bytes?: number,
): PlanAttachmentLimit | null {
  const larger = cached_plan_limits
    .filter(
      (plan) =>
        plan.max_bytes > cached_max_bytes &&
        UPGRADE_PLAN_CODES.includes(plan.code),
    )
    .sort((a, b) => a.max_bytes - b.max_bytes);

  if (larger.length === 0) {
    return cached_upgrade_max_bytes > cached_max_bytes
      ? { code: "", max_bytes: cached_upgrade_max_bytes }
      : null;
  }

  if (typeof needed_bytes === "number" && needed_bytes > 0) {
    const fits = larger.find((plan) => plan.max_bytes >= needed_bytes);

    if (fits) return fits;
  }

  return larger[larger.length - 1];
}

export function get_max_total_attachments_size(): number {
  return cached_max_bytes;
}

export function is_above_free_attachment_limit(size_bytes: number): boolean {
  return size_bytes > FREE_MAX_ATTACHMENT_SIZE;
}

export function clear_attachment_limits_cache(): void {
  cached_max_bytes = FREE_MAX_ATTACHMENT_SIZE;
  cached_upgrade_max_bytes = MAX_PAID_ATTACHMENT_SIZE;
  cached_plan_limits = [];
  cache_timestamp = 0;
  in_flight = null;
}

export async function ensure_attachment_limits(): Promise<number> {
  return refresh_attachment_limits();
}

export async function refresh_attachment_limits(
  force = false,
): Promise<number> {
  if (!api_client.is_authenticated()) return cached_max_bytes;

  const now = Date.now();

  if (!force && cache_timestamp > 0 && now - cache_timestamp < CACHE_TTL_MS) {
    return cached_max_bytes;
  }

  if (in_flight) return in_flight;

  in_flight = (async () => {
    try {
      const [response, current_response] = await Promise.all([
        get_available_plans(),
        get_current_plan(),
      ]);
      const plans = response.data?.plans ?? [];
      const limit = current_response.data?.plan.max_attachment_size_bytes;

      if (typeof limit === "number" && limit > 0) {
        cached_max_bytes = limit;
      }

      const upgrade_ceiling = plans.reduce(
        (highest, plan) =>
          plan.max_attachment_size_bytes > highest
            ? plan.max_attachment_size_bytes
            : highest,
        cached_max_bytes,
      );

      if (upgrade_ceiling > 0) {
        cached_upgrade_max_bytes = upgrade_ceiling;
      }

      cached_plan_limits = plans
        .filter((plan) => plan.max_attachment_size_bytes > 0)
        .map((plan) => ({
          code: plan.code,
          max_bytes: plan.max_attachment_size_bytes,
        }));

      if (response.data) {
        cache_timestamp = Date.now();
      }
    } catch (error) {
      ignore_error("services/attachment_limits:refresh", error);
    } finally {
      in_flight = null;
    }

    return cached_max_bytes;
  })();

  return in_flight;
}
