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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const is_native_platform = vi.fn(() => false);

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => is_native_platform() },
}));

vi.mock("@/services/iconic_sound_data", () => {
  const uri = `data:audio/mpeg;base64,${btoa("abc")}`;

  return {
    ICONIC_SOUND_SOURCES: {
      send: uri,
      undo_send: uri,
      incoming: uri,
      done: uri,
      fail: uri,
      compose: uri,
      upload: uri,
    },
  };
});

const started: unknown[] = [];
const stopped: unknown[] = [];
const context_control = {
  state: "running",
  resume: () => Promise.resolve(),
};
const decoded_sizes: number[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  get state() {
    return context_control.state;
  }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBufferSource() {
    const source = {
      buffer: null as unknown,
      connect: vi.fn(),
      disconnect: vi.fn(),
      onended: null,
      start: () => {
        started.push(source.buffer);
      },
      stop: () => {
        stopped.push(source.buffer);
      },
    };

    return source;
  }
  decodeAudioData(data: ArrayBuffer) {
    decoded_sizes.push(data.byteLength);

    return Promise.resolve({ size: data.byteLength });
  }
  resume() {
    return context_control.resume();
  }
}

async function load_service() {
  vi.resetModules();

  return import("@/services/iconic_sounds");
}

async function settle() {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("iconic_sounds", () => {
  beforeEach(() => {
    started.length = 0;
    stopped.length = 0;
    context_control.state = "running";
    context_control.resume = () => Promise.resolve();
    decoded_sizes.length = 0;
    is_native_platform.mockReturnValue(false);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays silent and loads nothing while turned off", async () => {
    const service = await load_service();

    expect(service.play_iconic_sound("send")).toBe(false);
    await settle();
    expect(decoded_sizes).toHaveLength(0);
    expect(started).toHaveLength(0);
  });

  it("decodes the inlined data and plays once turned on", async () => {
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    expect(service.play_iconic_sound("send")).toBe(true);
    await settle();
    expect(decoded_sizes).toHaveLength(service.ICONIC_SOUNDS.length);
    expect(decoded_sizes.every((size) => size === 3)).toBe(true);
    expect(started).toHaveLength(1);
  });

  it("throttles a repeated sound but still reports it as handled", async () => {
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    expect(service.play_iconic_sound("incoming")).toBe(true);
    expect(service.play_iconic_sound("incoming")).toBe(true);
    await settle();
    expect(started).toHaveLength(1);
  });

  it("stops playing after it is turned off again", async () => {
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    service.set_iconic_sounds_enabled(false);
    expect(service.play_iconic_sound("done")).toBe(false);
    await settle();
    expect(started).toHaveLength(0);
  });

  it("skips the sent sound for a send that already played at queue time", async () => {
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    service.mark_send_queued(Date.now() + 60000);
    expect(service.play_send_settled_sound()).toBe(false);
    await settle();
    expect(started).toHaveLength(0);
  });

  it("plays the sent sound for a send with no undo window", async () => {
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    expect(service.play_send_settled_sound()).toBe(true);
    await settle();
    expect(started).toHaveLength(1);
  });

  it("restarts a sound that is still playing instead of stacking it", async () => {
    const service = await load_service();

    expect(service.preview_iconic_sound("done")).toBe(true);
    await settle();
    expect(service.preview_iconic_sound("done")).toBe(true);
    await settle();
    expect(started).toHaveLength(2);
    expect(stopped).toHaveLength(1);
  });

  it("drops a sound when audio only unlocks long after the request", async () => {
    const service = await load_service();
    let unlock = () => {};

    context_control.state = "suspended";
    context_control.resume = () =>
      new Promise<void>((resolve) => {
        unlock = () => {
          context_control.state = "running";
          resolve();
        };
      });
    service.set_iconic_sounds_enabled(true);
    expect(service.play_iconic_sound("incoming")).toBe(true);
    await settle();

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 5000);

    unlock();
    await settle();
    clock.mockRestore();
    expect(started).toHaveLength(0);
  });

  it("previews a sound even while turned off", async () => {
    const service = await load_service();

    expect(service.preview_iconic_sound("compose")).toBe(true);
    await settle();
    expect(started).toHaveLength(1);
  });

  it("is unavailable in the native mobile app", async () => {
    is_native_platform.mockReturnValue(true);
    const service = await load_service();

    service.set_iconic_sounds_enabled(true);
    expect(service.is_iconic_sounds_supported()).toBe(false);
    expect(service.is_iconic_sounds_enabled()).toBe(false);
    expect(service.play_iconic_sound("send")).toBe(false);
    expect(service.preview_iconic_sound("send")).toBe(false);
  });
});
