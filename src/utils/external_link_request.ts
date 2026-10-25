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
export const EXTERNAL_LINK_EVENT = "aster-external-link";

export interface ExternalLinkRequestDetail {
  url: string;
  on_result?: (opened: boolean) => void;
}

export function request_external_link(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const on_result = (opened: boolean) => {
      if (settled) return;
      settled = true;
      resolve(opened);
    };
    const unhandled = window.dispatchEvent(
      new CustomEvent<ExternalLinkRequestDetail>(EXTERNAL_LINK_EVENT, {
        detail: { url, on_result },
        cancelable: true,
      }),
    );

    if (unhandled) on_result(false);
  });
}
