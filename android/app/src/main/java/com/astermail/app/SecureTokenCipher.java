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

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureTokenCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int TAG_BYTES = TAG_BITS / 8;
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private SecureTokenCipher() {
    }

    static String seal(SecretKey key, String name, String value)
        throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));

        byte[] nonce = cipher.getIV();
        if (nonce == null || nonce.length != NONCE_BYTES) {
            throw new GeneralSecurityException("unexpected_nonce");
        }

        byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] stored = new byte[nonce.length + sealed.length];
        System.arraycopy(nonce, 0, stored, 0, nonce.length);
        System.arraycopy(sealed, 0, stored, nonce.length, sealed.length);

        return toHex(stored);
    }

    static String open(SecretKey key, String name, String stored)
        throws GeneralSecurityException {
        byte[] bytes = fromHex(stored);
        if (bytes.length < NONCE_BYTES + TAG_BYTES) {
            throw new GeneralSecurityException("truncated_entry");
        }

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            new GCMParameterSpec(TAG_BITS, Arrays.copyOfRange(bytes, 0, NONCE_BYTES)));
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));

        byte[] opened = cipher.doFinal(bytes, NONCE_BYTES, bytes.length - NONCE_BYTES);

        return new String(opened, StandardCharsets.UTF_8);
    }

    private static String toHex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            out[index * 2] = HEX[(bytes[index] >> 4) & 0x0f];
            out[index * 2 + 1] = HEX[bytes[index] & 0x0f];
        }

        return new String(out);
    }

    private static byte[] fromHex(String text) throws GeneralSecurityException {
        if (text == null || text.length() % 2 != 0) {
            throw new GeneralSecurityException("malformed_entry");
        }

        byte[] out = new byte[text.length() / 2];
        for (int index = 0; index < out.length; index++) {
            int high = Character.digit(text.charAt(index * 2), 16);
            int low = Character.digit(text.charAt(index * 2 + 1), 16);
            if (high < 0 || low < 0) {
                throw new GeneralSecurityException("malformed_entry");
            }
            out[index] = (byte) ((high << 4) | low);
        }

        return out;
    }
}
