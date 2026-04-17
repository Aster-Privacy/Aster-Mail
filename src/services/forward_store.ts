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
let forward_mail_id: string | undefined;

export function set_forward_mail_id(id: string | undefined): void {
  forward_mail_id = id;
}

export function get_forward_mail_id(): string | undefined {
  return forward_mail_id;
}

export function clear_forward_mail_id(): void {
  forward_mail_id = undefined;
}
