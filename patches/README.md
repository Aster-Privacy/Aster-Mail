# Patches

This directory holds the changes that `patch-package` applies to dependencies after `npm install`. Each patch is listed here with what it changes and why, so that you can review it without reading minified code.

## `openpgp+6.3.2.patch`

OpenPGP.js publishes its browser build as one minified line, so the patch file replaces that whole line and looks much larger than it is. The patch changes one function, `isSupported`, in the class that wraps the native AES-CBC implementation. Nothing else in the library differs from the published `openpgp@6.3.2` package.

### What it changes

Before the patch, OpenPGP.js decides whether to use the browser's native AES-CBC by importing a key:

```js
static isSupported(algo) {
  const { keySize } = getCipherParams(algo);
  return webCrypto
    .importKey("raw", new Uint8Array(keySize), "aes-cbc", false, ["encrypt"])
    .then(() => true, () => false);
}
```

After the patch, it imports the key and also encrypts one block with it:

```js
static isSupported(algo) {
  const { keySize } = getCipherParams(algo);
  return webCrypto
    .importKey("raw", new Uint8Array(keySize), { name: "AES-CBC" }, false, ["encrypt"])
    .then(
      (key) =>
        webCrypto
          .encrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, key, new Uint8Array(16))
          .then(() => true, () => false),
      () => false,
    );
}
```

The names above are the readable ones from the OpenPGP.js source. The minified build uses short names for the same code.

### Why it exists

On some WebKit builds, which the desktop app uses on macOS and Linux, `importKey` succeeds for AES-CBC but `encrypt` then fails. OpenPGP.js treats the successful import as proof that native AES-CBC works, so key generation stops with an error when it protects a new private key. With the patch, the check runs a real encryption first. When that fails, OpenPGP.js uses its own JavaScript AES implementation, which is the fallback it already ships. Browsers where native AES-CBC works take the same path as before.

The patch doesn't change any key, cipher, mode, or message format. It changes only which of the two existing AES implementations OpenPGP.js selects.

### Verify it yourself

To confirm that the patch contains this change and nothing else, compare the two lines of the patch file. This script prints the part of each line that differs:

```sh
node -e '
const lines = require("fs").readFileSync("patches/openpgp+6.3.2.patch", "utf8").split("\n");
const before = lines.find((line) => line.startsWith("-") && !line.startsWith("---")).slice(1);
const after = lines.find((line) => line.startsWith("+") && !line.startsWith("+++")).slice(1);
let start = 0;
while (before[start] === after[start]) start += 1;
let end = 0;
while (before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
console.log("before:", before.slice(start, before.length - end));
console.log("after: ", after.slice(start, after.length - end));
'
```

To check the starting point as well, download `openpgp@6.3.2` from the npm registry and confirm that `dist/openpgp.min.mjs` matches the line that the patch removes.

### Updating OpenPGP.js

When you bump the `openpgp` version, apply the same change to the new `dist/openpgp.min.mjs`, run `npx patch-package openpgp`, delete the old patch file, and update the file name in this document.
