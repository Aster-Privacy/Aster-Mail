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

import java.util.Locale;

final class ClipboardUriPolicy {

    static final long MAX_IMAGE_BYTES = 20L * 1024L * 1024L;

    private ClipboardUriPolicy() {}

    static boolean isAllowedSource(String scheme, String authority, String ownPackage) {
        if (scheme == null || !scheme.equalsIgnoreCase("content")) {
            return false;
        }
        if (authority == null || authority.isEmpty()) {
            return false;
        }
        if (ownPackage == null || ownPackage.isEmpty()) {
            return false;
        }

        String normalized = authority.toLowerCase(Locale.ROOT);
        String own = ownPackage.toLowerCase(Locale.ROOT);

        for (String entry : normalized.split(";")) {
            if (entry.equals(own) || entry.startsWith(own + ".")) {
                return false;
            }
        }

        return true;
    }

    static boolean isAllowedMime(String mimeType) {
        if (mimeType == null) {
            return false;
        }

        String normalized = mimeType.trim().toLowerCase(Locale.ROOT);

        return normalized.startsWith("image/") && normalized.length() > "image/".length();
    }
}
