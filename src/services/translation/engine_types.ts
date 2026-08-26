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
export const SUPPORTED_LANGUAGES = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "tr",
  "zh",
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const PIVOT_LANGUAGE: LanguageCode = "en";

export const LIMITED_QUALITY_LANGUAGES: readonly LanguageCode[] = [
  "ja",
  "ko",
  "zh",
];

export const RTL_LANGUAGES: readonly LanguageCode[] = ["ar"];

export interface LanguagePair {
  from: LanguageCode;
  to: LanguageCode;
}

export interface TranslationEngine {
  id: string;
  is_available(from: LanguageCode, to: LanguageCode): Promise<boolean>;
  requires_download(from: LanguageCode, to: LanguageCode): Promise<number>;
  prepare(
    from: LanguageCode,
    to: LanguageCode,
    signal: AbortSignal,
  ): Promise<void>;
  translate(
    segments: string[],
    from: LanguageCode,
    to: LanguageCode,
    signal: AbortSignal,
  ): Promise<string[]>;
  release(): void;
}

export class SegmentCountMismatchError extends Error {
  constructor(expected: number, received: number) {
    super(`expected ${expected} segments, received ${received}`);
    this.name = "SegmentCountMismatchError";
  }
}

export class EngineUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EngineUnavailableError";
  }
}

export function is_supported_language(value: string): value is LanguageCode {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalize_language(
  value: string | null | undefined,
): LanguageCode | null {
  if (!value) return null;

  const base = value.trim().toLowerCase().split(/[-_]/)[0];

  if (!base) return null;

  return is_supported_language(base) ? base : null;
}

export function has_limited_quality(language: LanguageCode): boolean {
  return LIMITED_QUALITY_LANGUAGES.includes(language);
}

export function direction_for(language: LanguageCode): "ltr" | "rtl" {
  return RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
}

export function pivot_route(
  from: LanguageCode,
  to: LanguageCode,
): LanguagePair[] {
  if (from === to) return [];

  if (from === PIVOT_LANGUAGE || to === PIVOT_LANGUAGE) {
    return [{ from, to }];
  }

  return [
    { from, to: PIVOT_LANGUAGE },
    { from: PIVOT_LANGUAGE, to },
  ];
}
