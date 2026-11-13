//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
package com.astermail.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import org.json.JSONObject;

@CapacitorPlugin(name = "SecureTokenStore")
public class SecureTokenStorePlugin extends Plugin {

    private static final String STORE_NAME = "aster_secure_tokens";
    private static final String KEY_ALIAS = "aster_token_wrap_v1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int KEY_BITS = 256;
    private static final int MAX_KEY_LENGTH = 128;
    private static final int MAX_VALUE_LENGTH = 16384;
    private static final Object LOCK = new Object();

    private static boolean isSupported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
    }

    private SharedPreferences store() {
        return getContext().getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }

    private static KeyStore keystore() throws GeneralSecurityException, IOException {
        KeyStore keystore = KeyStore.getInstance(KEYSTORE);
        keystore.load(null);

        return keystore;
    }

    private static SecretKey wrappingKey(boolean create)
        throws GeneralSecurityException, IOException {
        KeyStore.Entry entry = keystore().getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        if (!create) {
            return null;
        }

        KeyGenerator generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_BITS)
                .build());

        return generator.generateKey();
    }

    private static String requireKey(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty() || key.length() > MAX_KEY_LENGTH) {
            call.reject("invalid_request");
            return null;
        }

        return key;
    }

    private static boolean rejectIfUnsupported(PluginCall call) {
        if (isSupported()) {
            return false;
        }
        call.reject("unavailable");

        return true;
    }

    @PluginMethod()
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", isSupported());
        call.resolve(result);
    }

    @PluginMethod()
    public void set(PluginCall call) {
        if (rejectIfUnsupported(call)) {
            return;
        }
        String key = requireKey(call);
        if (key == null) {
            return;
        }
        String value = call.getString("value");
        if (value == null || value.length() > MAX_VALUE_LENGTH) {
            call.reject("invalid_request");
            return;
        }

        synchronized (LOCK) {
            try {
                String sealed = SecureTokenCipher.seal(wrappingKey(true), key, value);
                if (!store().edit().putString(key, sealed).commit()) {
                    call.reject("write_failed");
                    return;
                }
            } catch (GeneralSecurityException | IOException | RuntimeException error) {
                call.reject("write_failed");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod()
    public void get(PluginCall call) {
        if (rejectIfUnsupported(call)) {
            return;
        }
        String key = requireKey(call);
        if (key == null) {
            return;
        }

        String value = null;
        synchronized (LOCK) {
            String sealed = store().getString(key, null);
            if (sealed != null) {
                try {
                    SecretKey wrapping = wrappingKey(false);
                    if (wrapping != null) {
                        value = SecureTokenCipher.open(wrapping, key, sealed);
                    }
                } catch (GeneralSecurityException | IOException | RuntimeException error) {
                    value = null;
                }
                if (value == null) {
                    store().edit().remove(key).commit();
                }
            }
        }

        JSObject result = new JSObject();
        result.put("value", value == null ? JSONObject.NULL : value);
        call.resolve(result);
    }

    @PluginMethod()
    public void remove(PluginCall call) {
        if (rejectIfUnsupported(call)) {
            return;
        }
        String key = requireKey(call);
        if (key == null) {
            return;
        }

        synchronized (LOCK) {
            if (!store().edit().remove(key).commit()) {
                call.reject("write_failed");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod()
    public void clear(PluginCall call) {
        if (rejectIfUnsupported(call)) {
            return;
        }

        synchronized (LOCK) {
            boolean cleared = store().edit().clear().commit();
            try {
                KeyStore keystore = keystore();
                if (keystore.containsAlias(KEY_ALIAS)) {
                    keystore.deleteEntry(KEY_ALIAS);
                }
            } catch (GeneralSecurityException | IOException | RuntimeException error) {
                cleared = false;
            }
            if (!cleared) {
                call.reject("clear_failed");
                return;
            }
        }
        call.resolve();
    }
}
