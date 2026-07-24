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
import {
  apply_translations,
  collect_translatable_nodes,
  mark_translated,
  read_node_text,
} from "./dom_translate";
import {
  BERGAMOT_ENGINE_ID,
  MODEL_VERSION,
  register_bergamot_engine,
} from "./engine_bergamot";
import { load_engine } from "./engine_registry";
import type { LanguageCode, TranslationEngine } from "./engine_types";
import {
  flatten_segments,
  protect_entities,
  regroup_segments,
  restore_entities,
  segment_nodes,
} from "./text_prepare";
import {
  read_translation,
  write_translation,
} from "./translation_cache";

export interface TranslateBodyOptions {
  root: HTMLElement;
  account_id: string;
  message_id: string;
  from: LanguageCode;
  to: LanguageCode;
  signal: AbortSignal;
}

export interface TranslateBodyResult {
  translated: boolean;
  swapped: number;
}

const EMPTY_RESULT: TranslateBodyResult = { translated: false, swapped: 0 };

const MAX_TRANSLATION_CHARS = 24000;

function translatable_prefix(originals: string[]): number {
  let used = 0;

  for (let index = 0; index < originals.length; index += 1) {
    used += originals[index].length;

    if (used > MAX_TRANSLATION_CHARS) return index === 0 ? 1 : index;
  }

  return originals.length;
}

async function get_engine(): Promise<TranslationEngine | null> {
  register_bergamot_engine();

  try {
    return await load_engine(BERGAMOT_ENGINE_ID);
  } catch {
    return null;
  }
}

async function translate_segments(
  engine: TranslationEngine,
  segments: string[],
  from: LanguageCode,
  to: LanguageCode,
  signal: AbortSignal,
): Promise<string[] | null> {
  if (segments.length === 0) return [];

  try {
    const translated = await engine.translate(segments, from, to, signal);

    if (translated.length !== segments.length) return null;

    return translated;
  } catch {
    return null;
  }
}

export async function translate_message_body({
  root,
  account_id,
  message_id,
  from,
  to,
  signal,
}: TranslateBodyOptions): Promise<TranslateBodyResult> {
  if (from === to || signal.aborted) return EMPTY_RESULT;

  const nodes = collect_translatable_nodes(root);

  if (nodes.length === 0) return EMPTY_RESULT;

  const cache_parts = {
    account_id,
    message_id,
    source: from,
    target: to,
    model_version: MODEL_VERSION,
  };
  const cached = read_translation(cache_parts);

  if (cached && cached.length === nodes.length) {
    const swapped = apply_translations(nodes, cached);

    if (swapped > 0) mark_translated(root, to);

    return { translated: swapped > 0, swapped };
  }

  const engine = await get_engine();

  if (!engine || signal.aborted) return EMPTY_RESULT;

  const originals = read_node_text(nodes);
  const limit = translatable_prefix(originals);
  const head = originals.slice(0, limit);
  const protections = head.map((text) => protect_entities(text));
  const segmented = segment_nodes(
    protections.map((entry) => entry.masked),
    from,
  );
  const flat = flatten_segments(segmented);

  const translated_segments = await translate_segments(
    engine,
    flat.map((segment) => segment.text),
    from,
    to,
    signal,
  );

  if (!translated_segments || signal.aborted) return EMPTY_RESULT;

  const per_node_masked = regroup_segments(segmented, translated_segments);
  const per_node = originals.map((original, index) => {
    if (index >= limit) return original;

    const restored = restore_entities(per_node_masked[index], protections[index].entities);

    if (restored.missing > 0) return original;

    return restored.text;
  });

  write_translation(cache_parts, per_node);

  const swapped = apply_translations(nodes, per_node);

  if (swapped > 0) mark_translated(root, to);

  return { translated: swapped > 0, swapped };
}

export async function translate_plain_text(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  signal: AbortSignal,
): Promise<string | null> {
  if (from === to || !text.trim() || signal.aborted) return null;

  const engine = await get_engine();

  if (!engine || signal.aborted) return null;

  const { masked, entities } = protect_entities(text);
  const translated = await translate_segments(engine, [masked], from, to, signal);

  if (!translated || translated.length !== 1) return null;

  const restored = restore_entities(translated[0], entities);

  if (restored.missing > 0) return null;

  return restored.text === text ? null : restored.text;
}
