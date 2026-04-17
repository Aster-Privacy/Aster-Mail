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
export type RegistrationStep =
  | "welcome"
  | "email"
  | "password"
  | "generating"
  | "recovery_key"
  | "recovery_email"
  | "recovery_email_verification"
  | "plan_selection";

export const page_variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const page_transition = {
  duration: 0.2,
  ease: "easeOut",
};

export interface AlertProps {
  message: string;
  is_dark: boolean;
}

export const TRUSTED_REDIRECT_DOMAINS = [
  "checkout.stripe.com",
  "billing.stripe.com",
];

export function is_safe_redirect_url(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") return false;

    return TRUSTED_REDIRECT_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
