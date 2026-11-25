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

import { find_quote_start } from "./quote_detection";

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

function elapsed_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

function repeat_to(unit: string, size: number): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

const ATTACK_SIZE = 256 * 1024;

const OLD_FROM =
  /^\*?(?:From|Von|De|Da|Van|Från|Fra|Od|От|Lähettäjä|Feladó|Kimden|Από|发件人|寄件者|差出人|보낸\s*사람)\s*\*?\s*[:：]\s*\S/iu;
const NEW_FROM =
  /^\*?(?:From|Von|De|Da|Van|Från|Fra|Od|От|Lähettäjä|Feladó|Kimden|Από|发件人|寄件者|差出人|보낸\s*사람)\s*(?:\*\s*)?[:：]\s*\S/iu;
const OLD_DATE =
  /^\*?(?:Sent|Date|Gesendet|Datum|Envoyé|Enviado|Fecha|Inviato|Data|Verzonden|Skickat|Sendt|Wysłano|Отправлено|Дата|Lähetetty|Päivämäärä|Elküldve|Dátum|Gönderildi|Tarih|Στάλθηκε|Ημερομηνία|发送时间|日期|送信日時|日付|보낸\s*날짜)\s*\*?\s*[:：]/iu;
const NEW_DATE =
  /^\*?(?:Sent|Date|Gesendet|Datum|Envoyé|Enviado|Fecha|Inviato|Data|Verzonden|Skickat|Sendt|Wysłano|Отправлено|Дата|Lähetetty|Päivämäärä|Elküldve|Dátum|Gönderildi|Tarih|Στάλθηκε|Ημερομηνία|发送时间|日期|送信日時|日付|보낸\s*날짜)\s*(?:\*\s*)?[:：]/iu;
const OLD_SUBJECT =
  /^\*?(?:Subject|Betreff|Objet|Asunto|Assunto|Oggetto|Onderwerp|Ämne|Emne|Temat|Тема|Aihe|Tárgy|Konu|Θέμα|主题|主旨|件名|제목)\s*\*?\s*[:：]/iu;
const NEW_SUBJECT =
  /^\*?(?:Subject|Betreff|Objet|Asunto|Assunto|Oggetto|Onderwerp|Ämne|Emne|Temat|Тема|Aihe|Tárgy|Konu|Θέμα|主题|主旨|件名|제목)\s*(?:\*\s*)?[:：]/iu;
const OLD_FORWARDED = /-{3,}\s*Forwarded\s+[Mm]essage\s*-{3,}/;
const NEW_FORWARDED = /---\s*Forwarded\s+[Mm]essage\s*---/;
const OLD_ORIGINAL = /-{3,}\s*Original\s+[Mm]essage\s*-{3,}/i;
const NEW_ORIGINAL = /---\s*Original\s+[Mm]essage\s*---/i;

const PAIRS: [RegExp, RegExp][] = [
  [OLD_FROM, NEW_FROM],
  [OLD_DATE, NEW_DATE],
  [OLD_SUBJECT, NEW_SUBJECT],
  [OLD_FORWARDED, NEW_FORWARDED],
  [OLD_ORIGINAL, NEW_ORIGINAL],
];

const ALPHABET = [
  "From",
  "Date",
  "Subject",
  "보낸 사람",
  "*",
  " ",
  "\t",
  "\u00a0",
  ":",
  "：",
  "x",
  "-",
  "--",
  "Forwarded",
  "Original",
  "message",
  "Message",
  "MESSAGE",
];

const CASES = [
  "From: a",
  "From :a",
  "*From*: a",
  "From * : a",
  "From** : a",
  "From:",
  "Date*:",
  "Subject *：",
  "---- Forwarded message ----",
  "-- Forwarded message --",
  "--- original MESSAGE ---",
  "-------Forwarded  Message-------",
];

describe("quote header patterns", () => {
  it("keep the old matches", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 8000, 8, 111)]) {
      for (const [old_pattern, new_pattern] of PAIRS) {
        expect(new_pattern.test(value), `${old_pattern.source} ${JSON.stringify(value)}`).toBe(
          old_pattern.test(value),
        );
      }
    }
  });

  it("stay linear on long whitespace and dash runs", () => {
    const spaces = " ".repeat(ATTACK_SIZE);
    const inputs = [
      "From" + spaces + "x",
      "Date" + spaces + "*" + spaces,
      "Subject" + spaces,
      "-".repeat(ATTACK_SIZE),
      repeat_to("---Forwarded ", ATTACK_SIZE),
      "---" + spaces + "Original" + spaces,
    ];

    for (const value of inputs) {
      for (const [, new_pattern] of PAIRS) {
        expect(elapsed_ms(() => new_pattern.test(value))).toBeLessThan(500);
      }
    }
    expect(
      elapsed_ms(() => find_quote_start([{ text: "From" + spaces + "x" }])),
    ).toBeLessThan(500);
  });
});
