import { describe, it, expect } from "vitest";

import { parse_eml_file } from "./eml_parser";
import { parse_csv_file } from "./csv_parser";
import { parse_pst_file } from "./pst_parser";

function oversized_file(name: string, size: number): File {
  return { name, size } as File;
}

describe("import error messages substitute placeholders (no literal {{ }})", () => {
  it("eml oversized error fills size and limit", async () => {
    const result = await parse_eml_file(
      oversized_file("big.eml", 60 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("60.0");
    expect(result.errors[0]).toContain("50");
  });

  it("csv oversized error fills size and limit", async () => {
    const result = await parse_csv_file(
      oversized_file("big.csv", 600 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("600.0");
    expect(result.errors[0]).toContain("500");
  });

  it("pst oversized error fills size and limit", async () => {
    const result = await parse_pst_file(
      oversized_file("big.pst", 600 * 1024 * 1024),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("{{");
    expect(result.errors[0]).toContain("600.0");
  });
});
