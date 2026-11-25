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
import { describe, expect, it } from "vitest";

import {
  bracketed_tail_address,
  collapse_spaces_around_at,
  drop_blanks_before_newline,
  find_address_like,
  find_bracketed_ids,
  find_name_address_candidates,
  find_pgp_block,
  first_angle_capture,
  is_plain_address,
  name_angle_address,
  padded_name_angle_address,
  replace_html_tags,
  split_html_tags,
  split_mailto_url,
  split_outside_quotes,
  strip_angle_edges,
  strip_edge_runs,
  whitespace_or_chars,
} from "@/lib/address_scans";
import { is_js_whitespace } from "@/lib/linear_trim";

function seeded_random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function random_strings(
  alphabet: string[],
  count: number,
  max_length: number,
  seed: number,
): string[] {
  const random = seeded_random(seed);
  const out: string[] = [];

  for (let n = 0; n < count; n += 1) {
    const length = Math.floor(random() * (max_length + 1));
    let value = "";

    for (let i = 0; i < length; i += 1) {
      value += alphabet[Math.floor(random() * alphabet.length)];
    }
    out.push(value);
  }

  return out;
}

function expect_same<T>(
  inputs: string[],
  scan: (input: string) => T,
  oracle: (input: string) => T,
): void {
  for (const input of inputs) {
    expect([input, scan(input)]).toEqual([input, oracle(input)]);
  }
}

function expect_fast(run: () => void): void {
  const started = performance.now();

  run();
  expect(performance.now() - started).toBeLessThan(500);
}

const SIZE = 256 * 1024;

const ADDRESS_ALPHABET = [
  "a",
  "b",
  "Z",
  "1",
  "_",
  "%",
  "+",
  "-",
  "@",
  "@",
  ".",
  ".",
  " ",
  "\t",
  "\n",
  " ",
  "<",
  ">",
  "(",
  ")",
  ",",
  ";",
  ":",
  '"',
  "'",
  "[",
  "]",
  "é",
];

const ANGLE_ALPHABET = [
  "a",
  "b",
  "@",
  "<",
  "<",
  ">",
  ">",
  " ",
  "\t",
  "\n",
  "\r",
  " ",
  " ",
  '"',
  "'",
  ".",
];

const ADDRESS_CASES = [
  "",
  "@",
  "a@b",
  "a@b.c",
  "a@.c",
  "a@b.",
  "a@b..c",
  "@b.c",
  "a@@b.c",
  "a b@c.d",
  "first.last@example.org",
  "x@y.z.",
  "user+tag@sub.example.co.uk",
  "Name <a@b.co>",
  "<a@b.co>",
  "a@b.co, c@d.co",
  '"Doe, Jane" <j@d.co>, x@y.co',
  "a@b.c@d.e",
  "a@b.cc@d.ee",
  "x@@y.zz",
  "a@ b.c",
  "a @ b.cd",
  "  a  @  b.cd  ",
];

const ANGLE_CASES = [
  "",
  "<",
  ">",
  "<>",
  "<<>>",
  "<a>",
  "<a@b>",
  "<@b>",
  "<a@>",
  "<a@b>>",
  "<<a@b>",
  "Name <a@b.co>",
  "Name<a@b.co>",
  "  Name  <a@b.co>  ",
  '"Name" <a@b.co>',
  "Name <a@b.co> trailing",
  "Name <a@b.co>\n",
  "Line\nbreak <a@b.co>",
  "Line break <a@b.co>",
  "a <b> <c@d>",
  "a <b>c <d>",
  "<a> <b>",
  "x <a <b@c>",
  "x <a> b>",
  "<a@b> <c@d> <e f@g>",
  "<a @b>",
  " <a@b> ",
  "mailto:a@b.c",
  "mailto:a@b.c?subject=hi",
  "mailto:?body=x",
  "mailto:a?b?c",
  "mailto:a?b\nc",
  "mailto:a\n?b",
  "mailto:",
  "MAILTO:a@b",
];

describe("plain address checks", () => {
  const inputs = [
    ...ADDRESS_CASES,
    ...random_strings(ADDRESS_ALPHABET, 20000, 10, 1),
    ...random_strings(["a", "@", "."], 20000, 8, 2),
  ];

  it("matches the old whitespace-only address shape", () => {
    expect_same(
      inputs,
      (input) => is_plain_address(input, is_js_whitespace),
      (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input),
    );
  });

  it("matches the old mailto address shape", () => {
    const excluded = whitespace_or_chars('@<>(),;:"');

    expect_same(
      inputs,
      (input) => is_plain_address(input, excluded),
      (input) =>
        /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(input),
    );
  });

  it("accepts ordinary addresses when the exclusion set holds the at sign", () => {
    const excluded = whitespace_or_chars('@<>(),;:"');

    expect(is_plain_address("ada@example.com", excluded)).toBe(true);
    expect(is_plain_address("a@b.c", excluded)).toBe(true);
    expect(is_plain_address("a@b@c.d", excluded)).toBe(false);
  });

  it("matches the old recipient list address shape", () => {
    const excluded = whitespace_or_chars('@<>,;"');

    expect_same(
      inputs,
      (input) => is_plain_address(input, excluded),
      (input) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(input),
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(is_plain_address("a".repeat(SIZE) + "@", is_js_whitespace)).toBe(
        false,
      );
      expect(
        is_plain_address("a@" + "b".repeat(SIZE) + " ", is_js_whitespace),
      ).toBe(false);
      expect(is_plain_address("a@" + ".".repeat(SIZE), is_js_whitespace)).toBe(
        true,
      );
    });
  });
});

describe("split_outside_quotes", () => {
  const inputs = [
    ...ADDRESS_CASES,
    ...random_strings(["a", ",", '"', " "], 20000, 12, 3),
    ...random_strings(ADDRESS_ALPHABET, 10000, 12, 4),
  ];

  it("matches the old quote-aware comma split", () => {
    expect_same(
      inputs,
      (input) => split_outside_quotes(input),
      (input) => input.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/),
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(split_outside_quotes(",".repeat(SIZE)).length).toBe(SIZE + 1);
      expect(split_outside_quotes(",".repeat(SIZE) + '"').length).toBe(1);
      expect(split_outside_quotes(',"'.repeat(SIZE / 2)).length).toBe(
        SIZE / 4 + 1,
      );
    });
  });
});

describe("find_address_like", () => {
  const is_lower_letter = (code: number): boolean =>
    code >= 0x61 && code <= 0x7a;
  const is_digit = (code: number): boolean => code >= 0x30 && code <= 0x39;
  const is_name_domain = (code: number): boolean =>
    is_lower_letter(code) || is_digit(code) || code === 0x2e || code === 0x2d;
  const is_name_local = (code: number): boolean =>
    is_name_domain(code) || code === 0x5f || code === 0x25 || code === 0x2b;
  const is_word = (code: number): boolean =>
    is_lower_letter(code) ||
    is_digit(code) ||
    (code >= 0x41 && code <= 0x5a) ||
    code === 0x5f;
  const is_import_domain = (code: number): boolean =>
    is_word(code) || code === 0x2e || code === 0x2d;
  const is_import_local = (code: number): boolean =>
    is_import_domain(code) || code === 0x2b;

  const inputs = [
    ...ADDRESS_CASES,
    "paypal security a@b.co",
    "x@y.c",
    "x@y.cc.d",
    "a.b@c.d.ee",
    "a@b.c.dd",
    "__@__.__",
    ...random_strings(ADDRESS_ALPHABET, 20000, 12, 5),
    ...random_strings(["a", "@", ".", "-", "B", " "], 20000, 10, 6),
  ];

  it("matches the old sender name address pattern", () => {
    expect_same(
      inputs,
      (input) =>
        find_address_like(
          input,
          is_name_local,
          is_name_domain,
          is_lower_letter,
          2,
        ),
      (input) =>
        /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.exec(input)?.[0] ?? null,
    );
  });

  it("matches the old import address pattern", () => {
    expect_same(
      inputs,
      (input) =>
        find_address_like(input, is_import_local, is_import_domain, is_word, 1),
      (input) => /[\w.+-]+@[\w.-]+\.\w+/.exec(input)?.[0] ?? null,
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(
        find_address_like(
          "a".repeat(SIZE),
          is_name_local,
          is_name_domain,
          is_lower_letter,
          2,
        ),
      ).toBeNull();
      expect(
        find_address_like(
          "a@".repeat(SIZE / 2),
          is_name_local,
          is_name_domain,
          is_lower_letter,
          2,
        ),
      ).toBeNull();
      expect(
        find_address_like(
          "a@" + "1.".repeat(SIZE / 2),
          is_name_local,
          is_name_domain,
          is_lower_letter,
          2,
        ),
      ).toBeNull();
      expect(
        find_address_like(
          "a@" + ".".repeat(SIZE),
          is_import_local,
          is_import_domain,
          is_word,
          1,
        ),
      ).toBeNull();
    });
  });
});

describe("message id and angle scans", () => {
  const inputs = [
    ...ANGLE_CASES,
    ...random_strings(ANGLE_ALPHABET, 30000, 12, 7),
    ...random_strings(["<", ">", "@", "a", " "], 20000, 10, 8),
  ];

  it("matches the old bracketed message id pattern", () => {
    expect_same(
      inputs,
      (input) => find_bracketed_ids(input),
      (input) => input.match(/<[^<>\s]+@[^<>\s]+>/g),
    );
  });

  it("matches the old user id address pattern", () => {
    expect_same(
      inputs,
      (input) => bracketed_tail_address(input),
      (input) => /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(input)?.[1] ?? null,
    );
  });

  it("matches the old first angle capture", () => {
    expect_same(
      inputs,
      (input) => first_angle_capture(input),
      (input) => /<([^>]+)>/.exec(input)?.[1] ?? null,
    );
  });

  it("matches the old angle edge strip", () => {
    expect_same(
      inputs,
      (input) => strip_angle_edges(input),
      (input) => input.replace(/^<+|>+$/g, ""),
    );
  });

  it("matches the old reply-to wrapper strip", () => {
    const leading = (code: number): boolean =>
      code === 0x3c || code === 0x22 || is_js_whitespace(code);
    const trailing = (code: number): boolean =>
      code === 0x3e || code === 0x22 || is_js_whitespace(code);

    expect_same(
      inputs,
      (input) => strip_edge_runs(input, leading, trailing),
      (input) => input.replace(/^[<\s"]+|[>\s"]+$/g, ""),
    );
  });

  it("matches the old envelope name and address pattern", () => {
    expect_same(
      inputs,
      (input) => name_angle_address(input),
      (input) => {
        const match = input.match(/^(.*?)\s*<([^>]+)>$/);

        return match ? { name: match[1], address: match[2] } : null;
      },
    );
  });

  it("matches the old sealed address pattern", () => {
    expect_same(
      inputs,
      (input) => padded_name_angle_address(input),
      (input) => {
        const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(input);

        return match ? { name: match[1], address: match[2] } : null;
      },
    );
  });

  it("matches the old mailto split", () => {
    const mailto_inputs = [
      ...inputs,
      ...inputs.map((input) => `mailto:${input}`),
      ...random_strings(["a", "?", "\n", " ", "&"], 10000, 8, 9).map(
        (input) => `mailto:${input}`,
      ),
    ];

    expect_same(
      mailto_inputs,
      (input) => split_mailto_url(input),
      (input) => {
        const match = input.match(/^mailto:([^?]*)\??(.*)$/);

        return match ? [match[1], match[2]] : null;
      },
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(find_bracketed_ids("<a@".repeat(SIZE / 3))).toBeNull();
      expect(find_bracketed_ids("<" + "@".repeat(SIZE))).toBeNull();
      expect(bracketed_tail_address("@".repeat(SIZE) + ">")).toBeNull();
      expect(
        bracketed_tail_address("<a@b>" + " x".repeat(SIZE / 2)),
      ).toBeNull();
      expect(first_angle_capture("<".repeat(SIZE))).toBeNull();
      expect(
        strip_angle_edges("<".repeat(SIZE) + "a" + ">".repeat(SIZE)),
      ).toBe("a");
      expect(strip_angle_edges("a" + ">".repeat(SIZE) + "b")).toBe(
        "a" + ">".repeat(SIZE) + "b",
      );
      expect(name_angle_address(" ".repeat(SIZE) + "<>")).toBeNull();
      expect(name_angle_address("<".repeat(SIZE) + ">")).not.toBeNull();
      expect(name_angle_address("a" + " ".repeat(SIZE) + "x")).toBeNull();
      expect(padded_name_angle_address(" ".repeat(SIZE) + "x")).toBeNull();
      expect(
        padded_name_angle_address(
          "a" + " ".repeat(SIZE) + "<b>" + " ".repeat(SIZE),
        ),
      ).toEqual({ name: "a", address: "b" });
      expect(split_mailto_url("mailto:" + "?".repeat(SIZE))).not.toBeNull();
    });
  });
});

describe("blank and tag scans", () => {
  const blank_inputs = [
    "",
    " \n",
    "a \t\nb",
    "a \r\nb",
    "a \rb",
    "a \r\r\nb",
    " ",
    "a\t",
    ...random_strings(["a", " ", "\t", "\n", "\r"], 30000, 12, 10),
  ];
  const tag_inputs = [
    "",
    "<",
    ">",
    "<>",
    "a<b>c",
    "<a><b",
    "<<a>",
    "a<b<c>d>e",
    "<p>x</p><br>",
    ...random_strings(["a", "<", ">", " ", "\n"], 30000, 12, 11),
  ];

  it("matches the old blank before line feed replacement", () => {
    expect_same(
      blank_inputs,
      (input) => drop_blanks_before_newline(input, false),
      (input) => input.replace(/[ \t]+\n/g, "\n"),
    );
  });

  it("matches the old blank before line break replacement", () => {
    expect_same(
      blank_inputs,
      (input) => drop_blanks_before_newline(input, true),
      (input) => input.replace(/[ \t]+(?=\r?\n)/g, ""),
    );
  });

  it("matches the old tag replacement", () => {
    expect_same(
      tag_inputs,
      (input) => replace_html_tags(input, " "),
      (input) => input.replace(/<[^>]*>/g, " "),
    );
  });

  it("matches the old tag split", () => {
    expect_same(
      tag_inputs,
      (input) => split_html_tags(input),
      (input) => input.split(/(<[^>]*>)/),
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      const blanks = "a" + " \t".repeat(SIZE / 2) + "b";

      expect(drop_blanks_before_newline(blanks, false)).toBe(blanks);
      expect(drop_blanks_before_newline(blanks, true)).toBe(blanks);
      expect(drop_blanks_before_newline(blanks + " \r", true)).toBe(
        blanks + " \r",
      );
      expect(replace_html_tags("<".repeat(SIZE), " ")).toBe("<".repeat(SIZE));
      expect(split_html_tags("<".repeat(SIZE))).toEqual(["<".repeat(SIZE)]);
    });
  });
});

describe("sender name address scans", () => {
  const stops = ["<", ">", "(", ")", "[", "]", '"', "'", ",", ";", ":"];
  const inputs = [
    ...ADDRESS_CASES,
    "a@@b",
    "@@",
    "a@b@c@d",
    "x @ y . z",
    "Support (help@example.com)",
    "a@b@",
    "@a@b",
    ...random_strings(["a", "@", "@", " ", ".", ...stops], 30000, 12, 12),
    ...random_strings(["a", "@", " ", " ", "\t"], 20000, 10, 13),
  ];

  it("matches the old space around at collapse", () => {
    expect_same(
      inputs,
      (input) => collapse_spaces_around_at(input),
      (input) => input.replace(/ *@ */g, "@"),
    );
  });

  it("matches the old candidate loop", () => {
    expect_same(
      inputs,
      (input) => find_name_address_candidates(input),
      (input) => {
        const pattern = /[^\s<>()\[\]"',;:]+@[^\s<>()\[\]"',;:@]+/g;
        const found: string[] = [];
        let match = pattern.exec(input);

        while (match !== null) {
          found.push(match[0]);
          match = pattern.exec(input);
        }

        return found;
      },
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(collapse_spaces_around_at("a" + " ".repeat(SIZE) + "b@")).toBe(
        "a" + " ".repeat(SIZE) + "b@",
      );
      expect(find_name_address_candidates("a".repeat(SIZE))).toEqual([]);
      expect(find_name_address_candidates("@".repeat(SIZE))).toEqual([]);
      expect(find_name_address_candidates("a@".repeat(SIZE / 2)).length).toBe(
        1,
      );
    });
  });
});

describe("pgp block scan", () => {
  const begin = "-----BEGIN PGP MESSAGE-----";
  const end = "-----END PGP MESSAGE-----";
  const pattern =
    /(^[ \t]*|>)(-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----)/m;
  const inputs = [
    "",
    begin,
    `${begin}\n${end}`,
    `x${begin}\n${end}`,
    `>${begin}\n${end}`,
    `  \t${begin}x${end}`,
    `a\n  ${begin}x${end}`,
    `a\r  ${begin}x${end}`,
    `a ${begin}x${end}`,
    `x${begin} y\n${begin}z${end}${end}`,
    `<p>${begin}<br>x<br>${end}</p>`,
    `${end}${begin}`,
    ...random_strings(
      [begin, end, "\n", " ", "\t", ">", "x", "\r", " "],
      30000,
      7,
      14,
    ),
  ];

  it("matches the old pgp block pattern", () => {
    expect_same(
      inputs,
      (input) => find_pgp_block(input),
      (input) => {
        const match = pattern.exec(input);

        return match
          ? { index: match.index, prefix: match[1], block: match[2] }
          : null;
      },
    );
  });

  it("runs in linear time on attack input", () => {
    expect_fast(() => {
      expect(find_pgp_block(` x${begin}`.repeat(SIZE / 29))).toBeNull();
      expect(find_pgp_block(`\n ${begin}`.repeat(SIZE / 29))).toBeNull();
      expect(find_pgp_block("\n" + " ".repeat(SIZE) + "x" + begin)).toBeNull();
      expect(find_pgp_block(`>${begin}`.repeat(SIZE / 28))).toBeNull();
    });
  });
});
