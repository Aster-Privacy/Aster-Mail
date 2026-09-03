# Vendored: bergamot-translator

Third-party code. Not covered by this project's AGPLv3 license; retains its own.

- Source: `@browsermt/bergamot-translator`
- npm package version: `0.4.9`
- Build stamp compiled into the wasm worker: `BERGAMOT_VERSION_FULL = "v0.4.5+4917c11"`
- Upstream: https://github.com/browsermt/bergamot-translator
- License: MPL-2.0

The npm package version and the build stamp differ because the stamp records the
upstream C++ source revision the WebAssembly module was compiled from, not the npm
release. Record both when re-pinning. Don't reconcile them by editing either one.

## Files

- `translator.js` - ES module runtime (`BatchTranslator`, `TranslatorBacking`).
  Locally modified, see below.
- `public/bergamot/translator-worker.js` - worker glue. Locally modified, see below.
- `public/bergamot/bergamot-translator-worker.js` - emscripten JS, minified, see below.
- `public/bergamot/bergamot-translator-worker.wasm` - unmodified marian NMT wasm.

## Why vendored

Pinned and served from our own origin so that no model or runtime fetch ever
reaches a third-party host. The upstream default model registry points at Google
Cloud Storage; we never use it. See `engine_bergamot.ts`, which supplies a custom
`TranslatorBacking` that resolves every request against a self-hosted base URL.

## Local modifications

Three files diverge from upstream. Re-apply all three when re-pinning.

### `translator.js`: injectable worker URL

The hardcoded worker URL at `TranslatorBacking.loadWorker()` is replaced by an
injectable resolver (`setWorkerUrlResolver`, defined near the top of the file).
`engine_bergamot.ts` points it at the stable static path `/bergamot/`, so the worker
and its sibling `importScripts` and wasm fetch resolve correctly instead of being
hash-renamed by the bundler.

### `public/bergamot/translator-worker.js`: message origin check

The worker's `message` listener now drops events whose origin is neither empty nor
our own origin, before destructuring the payload:

    self.addEventListener('message', async function(event) {
        if (event.origin !== '' && event.origin !== self.location.origin)
            return;
        const {data: {id, name, args}} = event;

Added in `69a5b190` to close a code scanning finding. Upstream accepts messages from
any origin.

### `public/bergamot/bergamot-translator-worker.js`: minified

The emscripten glue ships minified rather than pretty-printed. The transform removes
whitespace and comments only, with no compression and no identifier mangling, so the
abstract syntax tree is unchanged. Regenerate it with terser:

    npx terser public/bergamot/bergamot-translator-worker.js       --output public/bergamot/bergamot-translator-worker.js

Run it with compression and mangling off, which is terser's default. Code scanning
skips minified files, which keeps 17 code quality findings in generated third-party
code out of the repository's results. GitHub's code quality analysis runs as a default
setup, so it does not read `.github/codeql/codeql-config.yml` and cannot be told to
ignore this path.

## Updating

Re-pin deliberately. Do not track upstream `main`.

    npm pack @browsermt/bergamot-translator@<version>

Extract and copy `translator.js` here and the three `worker/` files to
`public/bergamot/`. Re-apply all three local modifications above. Re-run the
translation test suite. Update the version, the build stamp, and this section.
