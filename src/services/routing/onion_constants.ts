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
export const CANONICAL_API_ONION =
  "asterwkopxf427ndjpgco5swerhivljvwcsggsxmfgmve4awbahpcrqd.onion";

export const CANONICAL_MAIL_ONION =
  "asterabf3d5xhqtphx5u462oegteygodgae5y542vmcai22ipkd3ojqd.onion";

export function is_canonical_api_onion(host: string): boolean {
  const normalized = host
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();

  return normalized === CANONICAL_API_ONION;
}
