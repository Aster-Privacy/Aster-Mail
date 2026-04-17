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
import { Capacitor } from "@capacitor/core";

const NATIVE_IMAGE_PROXY_URL = "https://app.astermail.org/api/images/v1/proxy";
const WEB_IMAGE_PROXY_URL = "/api/images/v1/proxy";

export function get_image_proxy_url(): string {
  const is_native =
    Capacitor.isNativePlatform() ||
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);

  return is_native ? NATIVE_IMAGE_PROXY_URL : WEB_IMAGE_PROXY_URL;
}
