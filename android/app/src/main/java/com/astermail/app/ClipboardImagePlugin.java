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
package com.astermail.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "ClipboardImage")
public class ClipboardImagePlugin extends Plugin {

    @PluginMethod()
    public void readImage(PluginCall call) {
        ClipboardManager clipboard = (ClipboardManager)
            getContext().getSystemService(Context.CLIPBOARD_SERVICE);

        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            JSObject result = new JSObject();
            result.put("image", JSObject.NULL);
            call.resolve(result);
            return;
        }

        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            JSObject result = new JSObject();
            result.put("image", JSObject.NULL);
            call.resolve(result);
            return;
        }

        ClipData.Item item = clip.getItemAt(0);
        Uri uri = item.getUri();

        if (uri == null) {
            JSObject result = new JSObject();
            result.put("image", JSObject.NULL);
            call.resolve(result);
            return;
        }

        resolveUri(call, uri);
    }

    @PluginMethod()
    public void readUri(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            JSObject result = new JSObject();
            result.put("image", JSObject.NULL);
            call.resolve(result);
            return;
        }

        Uri uri = Uri.parse(uriString);
        resolveUri(call, uri);
    }

    private void resolveUri(PluginCall call, Uri uri) {
        String mimeType = getContext().getContentResolver().getType(uri);
        if (mimeType == null || !mimeType.startsWith("image/")) {
            mimeType = "image/png";
        }

        try {
            InputStream inputStream = getContext()
                .getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                JSObject result = new JSObject();
                result.put("image", JSObject.NULL);
                call.resolve(result);
                return;
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[4096];
            int bytesRead;
            while ((bytesRead = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, bytesRead);
            }
            inputStream.close();

            String base64 = Base64.encodeToString(
                buffer.toByteArray(), Base64.NO_WRAP);
            String dataUrl = "data:" + mimeType + ";base64," + base64;

            JSObject result = new JSObject();
            result.put("image", dataUrl);
            result.put("mimeType", mimeType);
            call.resolve(result);

        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("image", JSObject.NULL);
            call.resolve(result);
        }
    }
}
