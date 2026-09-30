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

export function open_email_in_new_window(email_id: string): boolean {
  const width = Math.min(
    1180,
    Math.max(760, Math.round(window.screen.availWidth * 0.62)),
  );
  const height = Math.min(
    960,
    Math.max(560, Math.round(window.screen.availHeight * 0.86)),
  );
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - width) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - height) / 2),
  );

  const opened = window.open(
    `/email/${encodeURIComponent(email_id)}?popup=1`,
    "_blank",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );

  return !!opened;
}
