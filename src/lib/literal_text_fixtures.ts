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
export const FORMAT_PATCH_BODY = [
  "From 3f1c2a9b8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b Mon Sep 17 00:00:00 2001",
  "From: Alice Example <alice@example.org>",
  "Date: Tue, 14 Oct 2026 09:12:00 +0200",
  "Subject: [PATCH pssht] initialize",
  "",
  "Print a ready line before exiting.",
  "",
  "Signed-off-by: Alice Example <alice@example.org>",
  "---",
  " src/main.c | 6 ++++--",
  " 1 file changed, 4 insertions(+), 2 deletions(-)",
  "",
  "diff --git a/src/main.c b/src/main.c",
  "index e69de29..4b825dc 100644",
  "--- a/src/main.c",
  "+++ b/src/main.c",
  "@@ -1,7 +1,9 @@",
  " #include <stdio.h>",
  "+#include <stdlib.h>",
  " ",
  " int main(void)",
  " {",
  "-    return 0;",
  "+\tputs(\"ready\");",
  "+    /* > not a quote */",
  "+    return EXIT_SUCCESS;",
  " }",
  "-- ",
  "2.43.0",
  "",
].join("\n");

export const SEND_EMAIL_PATCH_BODY = [
  "---",
  " index.html | 2 +-",
  " 1 file changed, 1 insertion(+), 1 deletion(-)",
  "",
  "diff --git a/index.html b/index.html",
  "index 1a2b3c4..5d6e7f8 100644",
  "--- a/index.html",
  "+++ b/index.html",
  "@@ -3,3 +3,3 @@",
  " <body>",
  '-<div class="hero">Hello</div>',
  '+<div class="hero">Hello &amp; welcome</div>',
  " </body>",
  "-- ",
  "2.43.0",
  "",
].join("\n");

export const PATCH_WITH_ARMOR_BODY = [
  "diff --git a/keys/notice.asc b/keys/notice.asc",
  "new file mode 100644",
  "index 0000000..8e2f1a0",
  "--- /dev/null",
  "+++ b/keys/notice.asc",
  "@@ -0,0 +1,5 @@",
  "+-----BEGIN PGP MESSAGE-----",
  "+",
  "+hF4DAAAAAAAAAAASAQdAexampleexampleexampleexample",
  "+=AbCd",
  "+-----END PGP MESSAGE-----",
  "-- ",
  "2.43.0",
  "",
].join("\n");

export const CLEARSIGNED_BODY = [
  "-----BEGIN PGP SIGNED MESSAGE-----",
  "Hash: SHA256",
  "",
  "Release v1.2.0 is tagged.",
  "",
  "- - Fix the crash on startup",
  "    indented line stays put",
  "-----BEGIN PGP SIGNATURE-----",
  "",
  "iHUEARYIAB0WIQTexampleexampleexampleexampleexampleFAmcAAAAACgkQexample",
  "AAoJEexampleexampleexample",
  "=q1w2",
  "-----END PGP SIGNATURE-----",
].join("\n");

export const PUBLIC_KEY_BLOCK = [
  "-----BEGIN PGP PUBLIC KEY BLOCK-----",
  "",
  "mDMEZexampleFgkrBgEEAdpHDwEBB0Bexampleexampleexampleexampleexample",
  "tBxBbGljZSBFeGFtcGxlIDxhbGljZUBleGFtcGxlLm9yZz6Ijwexample",
  "=Zx9y",
  "-----END PGP PUBLIC KEY BLOCK-----",
].join("\n");

export const TEXT_WITH_PUBLIC_KEY_BODY = `Here is my key, please import it:\n\n${PUBLIC_KEY_BLOCK}\n\nThanks,\nAlice\n`;
