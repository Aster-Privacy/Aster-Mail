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
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";

export const EXPIRATION_FEATURE = "has_email_expiration";
export const PASSWORD_FEATURE = "has_password_protected_messages";

export type ExpiryFeature = typeof EXPIRATION_FEATURE | typeof PASSWORD_FEATURE;

export interface ExpiryPlanGateInput {
  expires_at?: Date | string | null;
  expiry_password?: string | null;
  limits_loaded: boolean;
  is_feature_locked: (feature_key: string) => boolean;
}

export function find_locked_expiry_feature({
  expires_at,
  expiry_password,
  limits_loaded,
  is_feature_locked,
}: ExpiryPlanGateInput): ExpiryFeature | null {
  if (!limits_loaded) return null;
  if (expires_at && is_feature_locked(EXPIRATION_FEATURE)) {
    return EXPIRATION_FEATURE;
  }
  if (expiry_password && is_feature_locked(PASSWORD_FEATURE)) {
    return PASSWORD_FEATURE;
  }

  return null;
}

export function prompt_expiry_upgrade(
  feature: ExpiryFeature,
  message: string,
): void {
  show_plan_limit_upgrade({ message, resource: null, feature });
}
