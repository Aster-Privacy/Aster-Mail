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
export const OPEN_PAYMENT_METHODS_EVENT = "aster:open-payment-methods";
export const BILLING_UPDATED_EVENT = "aster:billing-updated";

export function notify_billing_updated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BILLING_UPDATED_EVENT));
  }
}

let is_pending = false;

export function request_payment_method_update(): void {
  is_pending = true;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_PAYMENT_METHODS_EVENT));
  }
}

export function consume_payment_method_request(): boolean {
  const was_pending = is_pending;

  is_pending = false;

  return was_pending;
}
