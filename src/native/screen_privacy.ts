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
import { registerPlugin } from "@capacitor/core";

import { is_native_platform, get_platform } from "./capacitor_bridge";

interface ScreenPrivacyPlugin {
  setSecure(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
}

const ScreenPrivacy = registerPlugin<ScreenPrivacyPlugin>("ScreenPrivacy");

export async function set_screen_capture_blocked(
  enabled: boolean,
): Promise<boolean> {
  if (!is_native_platform() || get_platform() !== "android") return false;
  try {
    const result = await ScreenPrivacy.setSecure({ enabled });

    return result.enabled === enabled;
  } catch {
    return false;
  }
}
