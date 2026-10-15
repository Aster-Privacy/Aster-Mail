## Verify the APK

Every Aster Mail APK in this release is signed with the Aster release certificate. Before you install one, check that its signing certificate matches this fingerprint.

- **Package name:** `org.astermail.android`
- **SHA-256 certificate fingerprint:** `88:B0:A8:A6:FB:94:EE:73:A4:54:A0:F9:27:32:BD:40:8E:92:E5:1E:C1:E9:55:67:44:E5:F0:05:56:10:09:77`

To check a downloaded APK on a computer, run `apksigner verify --print-certs Aster-Mail.apk` from the Android SDK build tools. The `certificate SHA-256 digest` line shows the same value in lowercase without colons. To check the app on your phone, use a verification app such as AppVerifier.

If you install Aster Mail from Google Play, Google Play signs it with its own key, so that copy has a different fingerprint: `C2:0D:A2:1D:DA:9D:35:45:26:75:34:19:11:B0:01:E5:32:80:B5:C8:91:AB:90:9B:13:BF:27:63:77:40:A6:AF`
