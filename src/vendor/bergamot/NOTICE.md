# Vendored: bergamot-translator

Third-party code. Not covered by this project's AGPLv3 license; retains its own.

- Source: `@browsermt/bergamot-translator`
- Pinned version: `0.4.9`
- Upstream: https://github.com/browsermt/bergamot-translator
- License: MPL-2.0

## Files

- `translator.js` - unmodified ES module runtime (`BatchTranslator`, `TranslatorBacking`).
- `public/bergamot/translator-worker.js` - unmodified worker glue.
- `public/bergamot/bergamot-translator-worker.js` - unmodified emscripten JS.
- `public/bergamot/bergamot-translator-worker.wasm` - unmodified marian NMT wasm.

## Why vendored

Pinned and served from our own origin so that no model or runtime fetch ever
reaches a third-party host. The upstream default model registry points at Google
Cloud Storage; we never use it. See `engine_bergamot.ts`, which supplies a custom
`TranslatorBacking` that resolves every request against a self-hosted base URL.

## Local modifications

`translator.js` carries one deliberate patch from the pinned upstream: the
hardcoded worker URL at `TranslatorBacking.loadWorker()` is replaced by an
injectable resolver (`setWorkerUrlResolver`, defined near the top of the file).
`engine_bergamot.ts` points it at the stable static path `/bergamot/`, so the
worker and its sibling `importScripts` / wasm fetch resolve correctly instead of
being hash-renamed by the bundler. Re-apply this patch when re-pinning.

## Updating

Re-pin deliberately. Do not track upstream `main`.

    npm pack @browsermt/bergamot-translator@<version>

Extract and copy `translator.js` here and the three `worker/` files to
`public/bergamot/`. Re-run the translation test suite. Bump the version above.
