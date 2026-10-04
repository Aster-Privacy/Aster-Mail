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

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ClipboardUriPolicyTest {

    private static final String OWN = "com.astermail.app";

    @Test
    public void allowsAnotherAppsContentUri() {
        assertTrue(ClipboardUriPolicy.isAllowedSource(
            "content", "com.android.providers.media.documents", OWN));
        assertTrue(ClipboardUriPolicy.isAllowedSource(
            "CONTENT", "com.google.android.inputmethod.latin.fileprovider", OWN));
    }

    @Test
    public void rejectsFileAndOtherSchemes() {
        assertFalse(ClipboardUriPolicy.isAllowedSource("file", "", OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("file", null, OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("webkit-fake-url", "x", OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("android.resource", OWN, OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource(null, "x", OWN));
    }

    @Test
    public void rejectsOwnProviders() {
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", OWN + ".fileprovider", OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", "COM.ASTERMAIL.APP.FileProvider", OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", OWN, OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", "other.app;" + OWN + ".provider", OWN));
    }

    @Test
    public void keepsLookAlikePackagesSeparate() {
        assertTrue(ClipboardUriPolicy.isAllowedSource("content", OWN + "x.provider", OWN));
    }

    @Test
    public void rejectsEmptyAuthorityOrPackage() {
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", "", OWN));
        assertFalse(ClipboardUriPolicy.isAllowedSource("content", "a.b", ""));
    }

    @Test
    public void requiresImageMime() {
        assertTrue(ClipboardUriPolicy.isAllowedMime("image/png"));
        assertTrue(ClipboardUriPolicy.isAllowedMime("IMAGE/JPEG"));
        assertFalse(ClipboardUriPolicy.isAllowedMime(null));
        assertFalse(ClipboardUriPolicy.isAllowedMime("image/"));
        assertFalse(ClipboardUriPolicy.isAllowedMime("text/html"));
        assertFalse(ClipboardUriPolicy.isAllowedMime("application/octet-stream"));
    }
}
