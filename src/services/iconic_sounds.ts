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
import { Capacitor } from "@capacitor/core";

import { ignore_error } from "@/lib/ignore_error";

export const ICONIC_SOUNDS = [
  "send",
  "undo_send",
  "incoming",
  "done",
  "fail",
  "compose",
  "upload",
] as const;

export type IconicSound = (typeof ICONIC_SOUNDS)[number];

const MASTER_GAIN = 0.8;
const MAX_VOICES_PER_SOUND = 4;
const VOICE_STEAL_FADE_SECONDS = 0.015;
const MAX_START_DELAY_MS = 1500;
const QUEUED_SEND_TTL_MS = 300000;
const COMPOSE_AFTER_UNDO_MUTE_MS = 600;
const MIN_INTERVAL_MS: Record<IconicSound, number> = {
  send: 300,
  undo_send: 150,
  incoming: 3000,
  done: 150,
  fail: 250,
  compose: 150,
  upload: 300,
};
const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

let enabled = false;
let audio_context: AudioContext | null = null;
let master_gain: GainNode | null = null;
let load_promise: Promise<void> | null = null;
let unlock_armed = false;

const buffers = new Map<IconicSound, AudioBuffer>();
const active_voices = new Map<IconicSound, ActiveVoice[]>();
const last_played_at = new Map<IconicSound, number>();
const queued_send_expiries: number[] = [];

export function is_iconic_sounds_supported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.AudioContext === "undefined") return false;

  return !Capacitor.isNativePlatform();
}

function get_context(): AudioContext {
  if (!audio_context) {
    audio_context = new AudioContext({ latencyHint: "interactive" });
    master_gain = audio_context.createGain();
    master_gain.gain.value = MASTER_GAIN;
    master_gain.connect(audio_context.destination);
  }

  return audio_context;
}

function decode_data_uri(uri: string): ArrayBuffer {
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function load_buffers(): Promise<void> {
  const { ICONIC_SOUND_SOURCES } = await import("@/services/iconic_sound_data");
  const context = get_context();

  await Promise.all(
    ICONIC_SOUNDS.map(async (name) => {
      if (buffers.has(name)) return;

      buffers.set(
        name,
        await context.decodeAudioData(
          decode_data_uri(ICONIC_SOUND_SOURCES[name]),
        ),
      );
    }),
  );
}

function ensure_loaded(): Promise<void> {
  if (!load_promise) {
    load_promise = load_buffers().catch((caught) => {
      load_promise = null;
      throw caught;
    });
  }

  return load_promise;
}

function wake(): void {
  const context = get_context();

  if (context.state !== "running") {
    context
      .resume()
      .catch((caught) => ignore_error("services/iconic_sounds:resume", caught));
  }

  ensure_loaded().catch((caught) =>
    ignore_error("services/iconic_sounds:load", caught),
  );
}

function handle_unlock(): void {
  if (!enabled) return;
  if (audio_context?.state === "running" && load_promise) return;

  wake();
}

function arm_unlock(): void {
  if (!unlock_armed) {
    unlock_armed = true;
    UNLOCK_EVENTS.forEach((name) =>
      window.addEventListener(name, handle_unlock, {
        capture: true,
        passive: true,
      }),
    );
  }

  if (navigator.userActivation?.hasBeenActive) wake();
}

function disarm_unlock(): void {
  if (!unlock_armed) return;
  unlock_armed = false;
  UNLOCK_EVENTS.forEach((name) =>
    window.removeEventListener(name, handle_unlock, true),
  );
}

function release_voice(name: IconicSound, voice: ActiveVoice): void {
  const voices = active_voices.get(name);

  if (!voices) return;

  const index = voices.indexOf(voice);

  if (index >= 0) voices.splice(index, 1);
}

function start_voice(context: AudioContext, name: IconicSound): boolean {
  const buffer = buffers.get(name);

  if (!buffer || !master_gain || context.state !== "running") return false;

  const voices = active_voices.get(name) ?? [];

  active_voices.set(name, voices);

  while (voices.length >= MAX_VOICES_PER_SOUND) {
    const oldest = voices.shift();

    if (!oldest) break;

    const fade_ends_at = context.currentTime + VOICE_STEAL_FADE_SECONDS;

    oldest.gain.gain.setValueAtTime(1, context.currentTime);
    oldest.gain.gain.linearRampToValueAtTime(0, fade_ends_at);
    oldest.source.stop(fade_ends_at);
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const voice = { source, gain };

  source.buffer = buffer;
  source.connect(gain);
  gain.connect(master_gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    release_voice(name, voice);
  };
  voices.push(voice);
  source.start();

  return true;
}

function is_stale(requested_at: number): boolean {
  return Date.now() - requested_at > MAX_START_DELAY_MS;
}

async function start_when_ready(
  name: IconicSound,
  requested_at: number,
): Promise<void> {
  const context = get_context();

  await ensure_loaded();
  if (context.state !== "running") await context.resume();
  if (!enabled) return;
  if (is_stale(requested_at)) return;

  start_voice(context, name);
}

function request_playback(name: IconicSound): void {
  if (start_voice(get_context(), name)) return;

  start_when_ready(name, Date.now()).catch((caught) =>
    ignore_error("services/iconic_sounds:play", caught),
  );
}

export function set_iconic_sounds_enabled(next: boolean): void {
  enabled = next && is_iconic_sounds_supported();

  if (enabled) {
    arm_unlock();
  } else {
    disarm_unlock();
    audio_context
      ?.suspend()
      .catch((caught) =>
        ignore_error("services/iconic_sounds:suspend", caught),
      );
  }
}

export function is_iconic_sounds_enabled(): boolean {
  return enabled;
}

export function play_iconic_sound(name: IconicSound): boolean {
  if (!enabled) return false;

  const now = Date.now();
  const previous = last_played_at.get(name) ?? 0;

  if (now - previous < MIN_INTERVAL_MS[name]) return true;

  if (
    name === "compose" &&
    now - (last_played_at.get("undo_send") ?? 0) < COMPOSE_AFTER_UNDO_MUTE_MS
  ) {
    return true;
  }

  last_played_at.set(name, now);
  request_playback(name);

  return true;
}

function prune_queued_sends(): void {
  const now = Date.now();

  while (queued_send_expiries.length > 0 && queued_send_expiries[0] <= now) {
    queued_send_expiries.shift();
  }
}

export function mark_send_queued(scheduled_time: number): void {
  prune_queued_sends();
  queued_send_expiries.push(
    Math.max(scheduled_time, Date.now()) + QUEUED_SEND_TTL_MS,
  );
  queued_send_expiries.sort((left, right) => left - right);
}

export function release_queued_send(): void {
  prune_queued_sends();
  queued_send_expiries.shift();
}

export function play_send_settled_sound(): boolean {
  prune_queued_sends();

  if (queued_send_expiries.length > 0) {
    queued_send_expiries.shift();

    return false;
  }

  return play_iconic_sound("send");
}
