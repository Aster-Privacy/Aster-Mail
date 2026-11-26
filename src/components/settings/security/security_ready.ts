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
export interface SecurityReadyState {
  totp_settled: boolean;
  login_alerts_settled: boolean;
  recovery_settled: boolean;
  recovery_section_settled: boolean;
  passkeys_settled: boolean;
  guard_settled: boolean;
}

export function security_section_ready(state: SecurityReadyState): boolean {
  return Object.values(state).every(Boolean);
}
