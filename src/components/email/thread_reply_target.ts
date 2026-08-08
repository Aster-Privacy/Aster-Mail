//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export interface ThreadReplyTarget {
  thread_token: string;
  original_email_id?: string | null;
}

export interface OpenViewerIdentity {
  email_id: string | null;
  thread_token: string | null;
}

export function viewer_still_showing(
  open: OpenViewerIdentity,
  target: ThreadReplyTarget,
): boolean {
  if (open.thread_token && target.thread_token === open.thread_token) {
    return true;
  }

  return (
    !!target.original_email_id && target.original_email_id === open.email_id
  );
}
