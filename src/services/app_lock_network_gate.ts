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
const ALLOWED_WHILE_LOCKED = [
  "/core/v1/auth/refresh",
  "/core/v1/auth/logout",
  "/core/v1/auth/logout-all",
  "/core/v1/auth/clear-session",
];

let locked = false;

export function set_app_network_locked(value: boolean): void {
  locked = value;
}

export function is_app_network_locked(): boolean {
  return locked;
}

export function is_endpoint_allowed_while_locked(endpoint: string): boolean {
  return ALLOWED_WHILE_LOCKED.some((allowed) => endpoint.startsWith(allowed));
}
