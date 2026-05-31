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
import android.content.ContentResolver;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;

import androidx.core.view.ContentInfoCompat;
import androidx.core.view.OnReceiveContentListener;
import androidx.core.view.ViewCompat;

import com.getcapacitor.BridgeActivity;

import com.astermail.app.widget.WidgetBridgePlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "AsterMail";

    private static final String[] MIME_TYPES = new String[]{
        "image/*"
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ClipboardImagePlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        ViewCompat.setOnReceiveContentListener(
            webView, MIME_TYPES, new ImageContentReceiver());
    }

    private class ImageContentReceiver implements OnReceiveContentListener {
        @Override
        public ContentInfoCompat onReceiveContent(
                View view, ContentInfoCompat payload) {
            android.util.Pair<ContentInfoCompat, ContentInfoCompat> split =
                payload.partition(item -> item.getUri() != null);

            ContentInfoCompat uriContent = split.first;
            ContentInfoCompat remaining = split.second;

            if (uriContent != null) {
                ClipData clip = uriContent.getClip();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (uri != null) {
                        injectImageIntoWebView((WebView) view, uri);
                    }
                }
            }

            return remaining;
        }
    }

    private static final java.util.Set<String> ALLOWED_IMAGE_MIME_TYPES =
        new java.util.HashSet<>(java.util.Arrays.asList(
            "image/png", "image/jpeg", "image/gif", "image/webp"
        ));

    private void injectImageIntoWebView(WebView webView, Uri uri) {
        ContentResolver cr = getContentResolver();
        String mimeType = cr.getType(uri);

        if (mimeType == null || !ALLOWED_IMAGE_MIME_TYPES.contains(mimeType)) {
            mimeType = "image/png";
        }

        try {
            InputStream is = cr.openInputStream(uri);
            if (is == null) return;

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(data)) != -1) {
                buffer.write(data, 0, bytesRead);
            }
            is.close();

            String base64 = Base64.encodeToString(
                buffer.toByteArray(), Base64.NO_WRAP);

            try {
                org.json.JSONObject arg = new org.json.JSONObject();
                arg.put("dataUrl", "data:" + mimeType + ";base64," + base64);
                arg.put("mimeType", mimeType);
                String safeArg = arg.toString();

                String js = "(function(arg){" +
                    "if(typeof window.__aster_paste_image==='function'){" +
                    "  window.__aster_paste_image(arg.dataUrl,arg.mimeType);return;" +
                    "}" +
                    "var img=document.createElement('img');" +
                    "img.src=arg.dataUrl;" +
                    "img.style.maxWidth='100%';" +
                    "img.style.height='auto';" +
                    "img.style.borderRadius='8px';" +
                    "img.style.display='block';" +
                    "img.style.margin='4px 0';" +
                    "var eds=document.querySelectorAll('[contenteditable=\"true\"]');" +
                    "for(var i=eds.length-1;i>=0;i--){" +
                    "  var ed=eds[i];" +
                    "  if(ed.offsetHeight>0){" +
                    "    ed.appendChild(img);" +
                    "    ed.dispatchEvent(new Event('input',{bubbles:true}));return;" +
                    "  }" +
                    "}" +
                    "})(" + safeArg + ")";

                webView.post(() -> webView.evaluateJavascript(js, null));
            } catch (org.json.JSONException e) {
                Log.w(TAG, "Failed to build image inject payload", e);
            }

        } catch (SecurityException e) {
            Log.w(TAG, "SecurityException reading clipboard URI: " + uri, e);
        } catch (Exception e) {
            Log.w(TAG, "Failed to read clipboard URI: " + uri, e);
        }
    }
}
