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
  BatchTranslator,
  type BergamotModelEntry,
  setWorkerUrlResolver,
  TranslatorBacking,
} from "@/vendor/bergamot/translator.js";

import { register_engine } from "./engine_registry";
import {
  EngineUnavailableError,
  type LanguageCode,
  PIVOT_LANGUAGE,
  pivot_route,
  type TranslationEngine,
} from "./engine_types";

export const BERGAMOT_ENGINE_ID = "bergamot";
export const MODEL_VERSION = "v1";

const WORKER_URL = "/bergamot/translator-worker.js";
const DEFAULT_MODEL_BASE = "/bergamot/models/v1";
const MODEL_REGISTRY_REVISION = "2";

function model_base(): string {
  const configured =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_TRANSLATION_MODEL_URL as string | undefined)
      : undefined;

  const base = (configured ?? DEFAULT_MODEL_BASE).replace(/\/+$/, "");

  if (/^https?:\/\//i.test(base) && !/^https:\/\//i.test(base)) {
    return DEFAULT_MODEL_BASE;
  }

  return base;
}

function join_url(base: string, name: string): string {
  const origin_ref =
    typeof location !== "undefined"
      ? location.href
      : "https://app.astermail.org/";
  const root = new URL(base, origin_ref);
  const root_dir = root.href.endsWith("/") ? root.href : `${root.href}/`;
  const resolved = new URL(name, root_dir);

  if (resolved.origin !== root.origin) {
    throw new EngineUnavailableError("translation model url origin mismatch");
  }

  return resolved.href;
}

class SelfHostedBacking extends TranslatorBacking {
  private readonly base: string;

  constructor(base: string) {
    super({
      registryUrl: `${base}/registry.json?r=${MODEL_REGISTRY_REVISION}`,
      pivotLanguage: PIVOT_LANGUAGE,
      cacheSize: 16384,
    });

    this.base = base;
  }

  async loadModelRegistery(): Promise<BergamotModelEntry[]> {
    const entries = await super.loadModelRegistery();

    for (const entry of entries) {
      for (const file of Object.values(entry.files)) {
        if (file && typeof file.name === "string") {
          file.name = join_url(this.base, file.name);
        }
      }
    }

    return entries;
  }
}

const TRANSLATE_TIMEOUT_MS = 30000;
const COLD_TRANSLATE_BASE_MS = 90000;
const COLD_TRANSLATE_MS_PER_MB = 1500;
const MODEL_MEMORY_BUDGET_BYTES = 130_000_000;

function with_deadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeout_ms: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", on_abort);
    };

    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      run();
    };

    const on_abort = () =>
      finish(() => reject(new EngineUnavailableError("aborted")));

    const timer = setTimeout(
      () =>
        finish(() => reject(new EngineUnavailableError("translate timed out"))),
      timeout_ms,
    );

    if (signal.aborted) {
      finish(() => reject(new EngineUnavailableError("aborted")));

      return;
    }

    signal.addEventListener("abort", on_abort);

    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) =>
        finish(() =>
          reject(
            error instanceof Error
              ? error
              : new EngineUnavailableError(String(error)),
          ),
        ),
    );
  });
}

interface AvailabilityMap {
  pairs: Set<string>;
  bytes: Map<string, number>;
}

function entry_bytes(entry: BergamotModelEntry): number {
  let total = 0;

  for (const file of Object.values(entry.files)) {
    if (file && typeof file.size === "number") total += file.size;
  }

  return total;
}

function pair_key(from: string, to: string): string {
  return `${from}>${to}`;
}

class BergamotEngine implements TranslationEngine {
  readonly id = BERGAMOT_ENGINE_ID;

  private readonly base = model_base();
  private backing: SelfHostedBacking | null = null;
  private translator: BatchTranslator | null = null;
  private availability: Promise<AvailabilityMap> | null = null;
  private loaded_pairs = new Set<string>();

  private get_backing(): SelfHostedBacking {
    if (!this.backing) {
      setWorkerUrlResolver(() => WORKER_URL);
      this.backing = new SelfHostedBacking(this.base);
    }

    return this.backing;
  }

  private get_translator(): BatchTranslator {
    if (!this.translator) {
      this.translator = new BatchTranslator(
        { workers: 1, batchSize: 8, downloadTimeout: 0 },
        this.get_backing(),
      );
    }

    return this.translator;
  }

  private load_availability(): Promise<AvailabilityMap> {
    if (!this.availability) {
      this.availability = this.get_backing()
        .loadModelRegistery()
        .then((entries) => ({
          pairs: new Set(entries.map((entry) => pair_key(entry.from, entry.to))),
          bytes: new Map(
            entries.map((entry) => [
              pair_key(entry.from, entry.to),
              entry_bytes(entry),
            ]),
          ),
        }))
        .catch((error: unknown) => {
          this.availability = null;

          throw error instanceof Error
            ? error
            : new EngineUnavailableError(String(error));
        });
    }

    return this.availability;
  }

  private route_supported(map: AvailabilityMap, from: LanguageCode, to: LanguageCode): boolean {
    const hops = pivot_route(from, to);

    if (hops.length === 0) return true;

    return hops.every((hop) => map.pairs.has(pair_key(hop.from, hop.to)));
  }

  async is_available(from: LanguageCode, to: LanguageCode): Promise<boolean> {
    if (from === to) return true;

    return this.route_supported(await this.load_availability(), from, to);
  }

  async requires_download(from: LanguageCode, to: LanguageCode): Promise<number> {
    const map = await this.load_availability();
    const hops = pivot_route(from, to)
      .map((hop) => pair_key(hop.from, hop.to))
      .filter((hop) => !this.loaded_pairs.has(hop));

    return this.bytes_for(map, hops);
  }

  async prepare(from: LanguageCode, to: LanguageCode): Promise<void> {
    const map = await this.load_availability();

    if (!this.route_supported(map, from, to)) {
      throw new EngineUnavailableError(`no bergamot route for ${from}->${to}`);
    }
  }

  private bytes_for(map: AvailabilityMap, hops: Iterable<string>): number {
    let total = 0;

    for (const hop of hops) total += map.bytes.get(hop) ?? 0;

    return total;
  }

  private reserve_models(
    map: AvailabilityMap,
    from: LanguageCode,
    to: LanguageCode,
  ): { bytes: number; cold: boolean } {
    const hops = pivot_route(from, to).map((hop) => pair_key(hop.from, hop.to));
    const missing = hops.filter((hop) => !this.loaded_pairs.has(hop));

    if (
      missing.length > 0 &&
      this.bytes_for(map, this.loaded_pairs) + this.bytes_for(map, missing) >
        MODEL_MEMORY_BUDGET_BYTES
    ) {
      this.reset_translator();
    }

    for (const hop of hops) this.loaded_pairs.add(hop);

    return { bytes: this.bytes_for(map, hops), cold: missing.length > 0 };
  }

  async translate(
    segments: string[],
    from: LanguageCode,
    to: LanguageCode,
    signal: AbortSignal,
  ): Promise<string[]> {
    if (segments.length === 0) return [];
    if (from === to) return segments.slice();
    if (signal.aborted) throw new EngineUnavailableError("aborted");

    const map = await this.load_availability();
    const reserved = this.reserve_models(map, from, to);

    try {
      return await this.run_translate(segments, from, to, signal, reserved);
    } catch (error) {
      if (signal.aborted) throw error;

      this.reset_translator();

      return await this.run_translate(
        segments,
        from,
        to,
        signal,
        this.reserve_models(map, from, to),
      );
    }
  }

  private async run_translate(
    segments: string[],
    from: LanguageCode,
    to: LanguageCode,
    signal: AbortSignal,
    reserved: { bytes: number; cold: boolean },
  ): Promise<string[]> {
    const translator = this.get_translator();
    const timeout = reserved.cold
      ? COLD_TRANSLATE_BASE_MS +
        Math.round((reserved.bytes / 1e6) * COLD_TRANSLATE_MS_PER_MB)
      : TRANSLATE_TIMEOUT_MS;

    let settled: PromiseSettledResult<string>[];

    try {
      settled = await with_deadline(
        Promise.allSettled(
          segments.map(async (text) => {
            if (!text.trim()) return text;

            const response = await translator.translate({
              from,
              to,
              text,
              html: false,
            });

            return response.target.text;
          }),
        ),
        signal,
        timeout,
      );
    } catch (error) {
      if (!signal.aborted) this.reset_translator();

      throw error;
    }

    if (signal.aborted) throw new EngineUnavailableError("aborted");

    const results: string[] = [];

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        this.reset_translator();

        throw outcome.reason instanceof Error
          ? outcome.reason
          : new EngineUnavailableError(String(outcome.reason));
      }

      results.push(outcome.value);
    }

    return results;
  }

  private reset_translator(): void {
    try {
      this.translator?.delete();
    } catch {}

    this.translator = null;
    this.loaded_pairs.clear();
  }

  release(): void {
    this.reset_translator();
    this.backing = null;
    this.availability = null;
  }
}

let registered = false;

export function register_bergamot_engine(): void {
  if (registered) return;

  registered = true;
  register_engine(BERGAMOT_ENGINE_ID, async () => new BergamotEngine());
}
