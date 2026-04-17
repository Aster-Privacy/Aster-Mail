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
import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWidgetData", returnType: CAPPluginReturnPromise)
    ]

    private let suite_name = "group.com.astermail.app"

    @objc func updateWidgetData(_ call: CAPPluginCall) {
        let unread = call.getString("unread_count") ?? "0"
        let starred = call.getString("starred_count") ?? "0"
        let drafts = call.getString("drafts_count") ?? "0"
        let last_updated = call.getString("last_updated") ?? "0"

        guard let defaults = UserDefaults(suiteName: suite_name) else {
            call.resolve(["success": false])
            return
        }

        defaults.set(unread, forKey: "unread_count")
        defaults.set(starred, forKey: "starred_count")
        defaults.set(drafts, forKey: "drafts_count")
        defaults.set(last_updated, forKey: "last_updated")

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["success": true])
    }

    @objc func getWidgetData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: suite_name) else {
            call.resolve([
                "unread_count": "0",
                "starred_count": "0",
                "drafts_count": "0",
                "last_updated": "0"
            ])
            return
        }

        call.resolve([
            "unread_count": defaults.string(forKey: "unread_count") ?? "0",
            "starred_count": defaults.string(forKey: "starred_count") ?? "0",
            "drafts_count": defaults.string(forKey: "drafts_count") ?? "0",
            "last_updated": defaults.string(forKey: "last_updated") ?? "0"
        ])
    }
}
