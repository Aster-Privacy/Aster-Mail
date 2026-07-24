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
declare module "@/vendor/bergamot/translator.js" {
  export interface BergamotBackingOptions {
    cacheSize?: number;
    downloadTimeout?: number;
    registryUrl?: string;
    pivotLanguage?: string | null;
    onerror?: (error: Error) => void;
  }

  export interface BergamotModelEntry {
    from: string;
    to: string;
    files: Record<string, { name: string; expectedSha256Hash?: string } | null>;
  }

  export class TranslatorBacking {
    constructor(options?: BergamotBackingOptions);
    registryUrl: string;
    registry: Promise<BergamotModelEntry[]>;
    options: BergamotBackingOptions;
    loadModelRegistery(): Promise<BergamotModelEntry[]>;
    loadWorker(): Promise<unknown>;
    fetch(url: string, checksum?: string, extra?: unknown): Promise<ArrayBuffer>;
  }

  export interface BergamotTranslationRequest {
    from: string;
    to: string;
    text: string;
    html?: boolean;
    priority?: number;
  }

  export interface BergamotTranslationResponse {
    request: BergamotTranslationRequest;
    target: { text: string };
  }

  export interface BatchTranslatorOptions extends BergamotBackingOptions {
    workers?: number;
    batchSize?: number;
    workerUrl?: string;
  }

  export class BatchTranslator {
    constructor(options?: BatchTranslatorOptions, backing?: TranslatorBacking);
    translate(
      request: BergamotTranslationRequest,
    ): Promise<BergamotTranslationResponse>;
    delete(): void;
  }

  export function setWorkerUrlResolver(resolver: () => string | URL): void;

  export class CancelledError extends Error {}
  export class SupersededError extends Error {}
}
