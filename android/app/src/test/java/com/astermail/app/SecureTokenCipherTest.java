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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;

import java.security.GeneralSecurityException;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import org.junit.Test;

public class SecureTokenCipherTest {

    private static SecretKey newKey() throws GeneralSecurityException {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);

        return generator.generateKey();
    }

    @Test
    public void roundTripsAValue() throws GeneralSecurityException {
        SecretKey key = newKey();
        String sealed = SecureTokenCipher.seal(key, "access", "token-value");

        assertFalse(sealed.contains("token-value"));
        assertEquals("token-value", SecureTokenCipher.open(key, "access", sealed));
    }

    @Test
    public void usesAFreshNonceEveryTime() throws GeneralSecurityException {
        SecretKey key = newKey();

        assertNotEquals(
            SecureTokenCipher.seal(key, "access", "token-value"),
            SecureTokenCipher.seal(key, "access", "token-value"));
    }

    @Test
    public void refusesAnEntryMovedToAnotherName() throws GeneralSecurityException {
        SecretKey key = newKey();
        String sealed = SecureTokenCipher.seal(key, "access", "token-value");

        assertThrows(
            GeneralSecurityException.class,
            () -> SecureTokenCipher.open(key, "refresh", sealed));
    }

    @Test
    public void refusesATamperedOrForeignEntry() throws GeneralSecurityException {
        SecretKey key = newKey();
        String sealed = SecureTokenCipher.seal(key, "access", "token-value");
        char last = sealed.charAt(sealed.length() - 1);
        String tampered =
            sealed.substring(0, sealed.length() - 1) + (last == '0' ? '1' : '0');

        assertThrows(
            GeneralSecurityException.class,
            () -> SecureTokenCipher.open(key, "access", tampered));
        assertThrows(
            GeneralSecurityException.class,
            () -> SecureTokenCipher.open(newKey(), "access", sealed));
    }

    @Test
    public void refusesMalformedEntries() throws GeneralSecurityException {
        SecretKey key = newKey();

        for (String stored : new String[]{"", "abc", "zz", "00ff"}) {
            assertThrows(
                GeneralSecurityException.class,
                () -> SecureTokenCipher.open(key, "access", stored));
        }
    }
}
