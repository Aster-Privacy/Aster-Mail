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

interface WidgetBridgePlugin {
  updateWidgetData(data: WidgetData): Promise<{ success: boolean }>;
  getWidgetData(): Promise<WidgetData>;
}

interface WidgetData {
  unread_count: string;
  starred_count: string;
  drafts_count: string;
  last_updated: string;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge");

export async function sync_widget_data(
  unread: number,
  starred: number,
  drafts: number,
): Promise<void> {
  if (!is_native_platform()) return;

  const platform = get_platform();

  if (platform === "android" || platform === "ios") {
    try {
      await WidgetBridge.updateWidgetData({
        unread_count: String(unread),
        starred_count: String(starred),
        drafts_count: String(drafts),
        last_updated: String(Date.now()),
      });
    } catch {
      return;
    }
  }
}

export async function get_widget_data(): Promise<WidgetData | null> {
  if (!is_native_platform()) return null;

  try {
    return await WidgetBridge.getWidgetData();
  } catch {
    return null;
  }
}
