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
import { EngineUnavailableError, type TranslationEngine } from "./engine_types";

export type EngineLoader = () => Promise<TranslationEngine>;

const loaders = new Map<string, EngineLoader>();
const instances = new Map<string, Promise<TranslationEngine>>();

export function register_engine(id: string, loader: EngineLoader): void {
  loaders.set(id, loader);
}

export function load_engine(id: string): Promise<TranslationEngine> {
  const existing = instances.get(id);

  if (existing) return existing;

  const loader = loaders.get(id);

  if (!loader) {
    return Promise.reject(
      new EngineUnavailableError(`no translation engine registered for ${id}`),
    );
  }

  const pending = loader().catch((error: unknown) => {
    instances.delete(id);

    throw error instanceof Error
      ? error
      : new EngineUnavailableError(String(error));
  });

  instances.set(id, pending);

  return pending;
}

export function release_engines(): void {
  for (const pending of instances.values()) {
    void pending.then(
      (engine) => engine.release(),
      () => {},
    );
  }

  instances.clear();
}

export function reset_engine_registry(): void {
  release_engines();
  loaders.clear();
}
