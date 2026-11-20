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
import { get_api_base_url, is_native_app } from "@/services/api/base_url";
import { open_external } from "@/utils/open_link";

export function bridge_download_url(platform: string): string {
  return `${get_api_base_url()}/bridge/v1/download/${encodeURIComponent(platform)}`;
}

export function open_bridge_download(url: string): void {
  if (is_native_app()) {
    open_external(url);

    return;
  }

  window.location.href = url;
}
