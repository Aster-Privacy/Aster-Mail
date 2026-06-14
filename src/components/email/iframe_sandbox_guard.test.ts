import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const renderer_source = readFileSync(
  resolve(here, "sandboxed_email_renderer.tsx"),
  "utf8",
);
const secure_view_source = readFileSync(
  resolve(here, "../../pages/secure_view.tsx"),
  "utf8",
);

function sandbox_values(source: string): string[] {
  return source.match(/sandbox="([^"]*)"/g) ?? [];
}

describe("email iframe sandbox safety invariants", () => {
  it("main renderer never combines allow-scripts with allow-same-origin", () => {
    const values = sandbox_values(renderer_source);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const has_scripts = value.includes("allow-scripts");
      const has_same_origin = value.includes("allow-same-origin");
      expect(has_scripts && has_same_origin).toBe(false);
    }
  });

  it("main renderer disables scripts in the email frame via CSP", () => {
    expect(renderer_source.includes("script-src 'none'")).toBe(true);
  });

  it("secure view runs untrusted email at a null origin (no allow-same-origin)", () => {
    const values = sandbox_values(secure_view_source);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.includes("allow-same-origin")).toBe(false);
    }
  });

  it("secure view confines scripts to a per-render nonce", () => {
    expect(secure_view_source.includes("script-src 'nonce-")).toBe(true);
    const script_directives = secure_view_source.match(/script-src[^;"`]*/g) ?? [];
    expect(script_directives.length).toBeGreaterThan(0);
    for (const directive of script_directives) {
      expect(directive.includes("unsafe-inline")).toBe(false);
      expect(directive.includes("unsafe-eval")).toBe(false);
    }
  });
});
