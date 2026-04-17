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
package com.astermail.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import com.astermail.app.R;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    private static final String PREFS_NAME = "aster_widget_data";

    @PluginMethod()
    public void updateWidgetData(PluginCall call) {
        String unread_count = call.getString("unread_count", "0");
        String starred_count = call.getString("starred_count", "0");
        String drafts_count = call.getString("drafts_count", "0");
        String last_updated = call.getString("last_updated", "0");

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString("unread_count", unread_count)
            .putString("starred_count", starred_count)
            .putString("drafts_count", drafts_count)
            .putString("last_updated", last_updated)
            .commit();

        updateAllWidgets(context, unread_count, starred_count, drafts_count);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod()
    public void getWidgetData(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        JSObject result = new JSObject();
        result.put("unread_count", prefs.getString("unread_count", "0"));
        result.put("starred_count", prefs.getString("starred_count", "0"));
        result.put("drafts_count", prefs.getString("drafts_count", "0"));
        result.put("last_updated", prefs.getString("last_updated", "0"));
        call.resolve(result);
    }

    private void updateAllWidgets(Context context, String unread, String starred, String drafts) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);

        int[] unread_ids = manager.getAppWidgetIds(
            new ComponentName(context, UnreadCountWidgetProvider.class));
        if (unread_ids != null) {
            for (int id : unread_ids) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_unread_count);
                views.setTextViewText(R.id.unread_count_text, unread);
                views.setOnClickPendingIntent(R.id.widget_root,
                    WidgetUpdateHelper.createDeepLinkIntent(context, "inbox"));
                manager.updateAppWidget(id, views);
            }
        }

        int[] stats_ids = manager.getAppWidgetIds(
            new ComponentName(context, MailStatsWidgetProvider.class));
        if (stats_ids != null) {
            for (int id : stats_ids) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mail_stats);
                views.setTextViewText(R.id.stats_unread_count, unread);
                views.setTextViewText(R.id.stats_starred_count, starred);
                views.setTextViewText(R.id.stats_drafts_count, drafts);
                views.setOnClickPendingIntent(R.id.stats_unread_section,
                    WidgetUpdateHelper.createDeepLinkIntent(context, "inbox"));
                views.setOnClickPendingIntent(R.id.stats_starred_section,
                    WidgetUpdateHelper.createDeepLinkIntent(context, "starred"));
                views.setOnClickPendingIntent(R.id.stats_drafts_section,
                    WidgetUpdateHelper.createDeepLinkIntent(context, "drafts"));
                manager.updateAppWidget(id, views);
            }
        }
    }
}
