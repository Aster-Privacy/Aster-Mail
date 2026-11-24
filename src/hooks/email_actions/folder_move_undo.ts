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
export interface FolderMoveUndoPlan {
  remove_token?: string;
  restore_token?: string;
}

export function plan_folder_move_undo(
  previous_tokens: string[],
  folder_token: string,
  from_folder_token: string | undefined,
): FolderMoveUndoPlan {
  return {
    remove_token: previous_tokens.includes(folder_token)
      ? undefined
      : folder_token,
    restore_token:
      from_folder_token && from_folder_token !== folder_token
        ? from_folder_token
        : undefined,
  };
}
