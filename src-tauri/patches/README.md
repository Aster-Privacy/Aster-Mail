# Patched crates

Each folder here is an unmodified crates.io release with one targeted fix, wired in through `[patch.crates-io]` in `Cargo.toml`.

## glib-0.18.5

`VariantStrIter` passes its output pointer to `g_variant_get_child` as `&mut p` instead of `&p`, matching the fix that upstream released in glib 0.20. Tauri depends on gtk 0.18, which requires glib 0.18, so the fix is carried here. Because `cargo audit` matches advisories by crate name and version, `.cargo/audit.toml` ignores RUSTSEC-2024-0429. Remove the patch and the ignore when Tauri moves to glib 0.20 or later.
