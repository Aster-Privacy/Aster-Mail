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

const MASTER_GAIN = 1;
const TARGET_PEAK = 0.89;
const MAX_SOUND_GAIN = 4;
const ONSET_THRESHOLD = 0.004;
const ONSET_LEAD_SECONDS = 0.004;
const START_LEAD_SECONDS = 0.03;
const RESUME_LEAD_SECONDS = 0.12;
const RETRIGGER_FADE_SECONDS = 0.02;
const MAX_START_DELAY_MS = 1500;
const MIN_INTERVAL_MS: Record<IconicSound, number> = {
  send: 600,
  undo_send: 600,
  incoming: 3000,
  done: 400,
  fail: 1200,
  compose: 400,
  upload: 600,
};
const WARM_UP_EVENTS = ["pointerdown", "keydown"] as const;

let enabled = false;
let audio_context: AudioContext | null = null;
let master_gain: GainNode | null = null;
let load_promise: Promise<void> | null = null;
let warm_up_armed = false;
let send_settles_at = 0;

interface LoadedSound {
  buffer: AudioBuffer;
  gain: number;
  offset: number;
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const buffers = new Map<IconicSound, LoadedSound>();
const active_voices = new Map<IconicSound, ActiveVoice>();
const last_played_at = new Map<IconicSound, number>();

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

function measure_sound(buffer: AudioBuffer): LoadedSound {
  let peak = 0;
  let onset = buffer.length;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);

    for (let index = 0; index < samples.length; index += 1) {
      const level = Math.abs(samples[index]);

      if (level > peak) peak = level;
      if (level > ONSET_THRESHOLD && index < onset) onset = index;
    }
  }

  const gain = peak > 0 ? Math.min(TARGET_PEAK / peak, MAX_SOUND_GAIN) : 1;
  const onset_seconds = onset < buffer.length ? onset / buffer.sampleRate : 0;

  return {
    buffer,
    gain,
    offset: Math.max(0, onset_seconds - ONSET_LEAD_SECONDS),
  };
}

async function load_buffers(): Promise<void> {
  const { ICONIC_SOUND_SOURCES } = await import("@/services/iconic_sound_data");
  const context = get_context();

  await Promise.all(
    ICONIC_SOUNDS.map(async (name) => {
      if (buffers.has(name)) return;

      const decoded = await context.decodeAudioData(
        decode_data_uri(ICONIC_SOUND_SOURCES[name]),
      );

      buffers.set(name, measure_sound(decoded));
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

function disarm_warm_up(): void {
  if (!warm_up_armed) return;
  warm_up_armed = false;
  WARM_UP_EVENTS.forEach((name) =>
    window.removeEventListener(name, handle_warm_up, true),
  );
}

function handle_warm_up(): void {
  disarm_warm_up();
  if (!enabled) return;

  ensure_loaded()
    .then(() => audio_context?.resume())
    .catch((caught) => ignore_error("services/iconic_sounds:warm_up", caught));
}

function arm_warm_up(): void {
  if (navigator.userActivation?.hasBeenActive) {
    handle_warm_up();

    return;
  }

  if (warm_up_armed) return;
  warm_up_armed = true;
  WARM_UP_EVENTS.forEach((name) =>
    window.addEventListener(name, handle_warm_up, {
      capture: true,
      passive: true,
    }),
  );
}

function is_stale(requested_at: number): boolean {
  return Date.now() - requested_at > MAX_START_DELAY_MS;
}

async function start_playback(
  name: IconicSound,
  requested_at: number,
): Promise<void> {
  const context = get_context();
  const sound = buffers.get(name);

  if (!sound || !master_gain) return;

  let lead = START_LEAD_SECONDS;

  if (context.state !== "running") {
    await context.resume();
    lead = RESUME_LEAD_SECONDS;
  }

  if (context.state !== "running" || is_stale(requested_at)) return;

  const starts_at = context.currentTime + lead;
  const previous = active_voices.get(name);

  if (previous) {
    previous.gain.gain.setValueAtTime(previous.gain.gain.value, starts_at);
    previous.gain.gain.linearRampToValueAtTime(
      0,
      starts_at + RETRIGGER_FADE_SECONDS,
    );
    previous.source.stop(starts_at + RETRIGGER_FADE_SECONDS);
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const voice = { source, gain };

  gain.gain.value = sound.gain;
  source.buffer = sound.buffer;
  source.connect(gain);
  gain.connect(master_gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (active_voices.get(name) === voice) active_voices.delete(name);
  };
  active_voices.set(name, voice);
  source.start(starts_at, sound.offset);
}

function request_playback(name: IconicSound, forced: boolean): void {
  const requested_at = Date.now();

  ensure_loaded()
    .then(() => {
      if (!forced && !enabled) return;
      if (is_stale(requested_at)) return;

      return start_playback(name, requested_at);
    })
    .catch((caught) => ignore_error("services/iconic_sounds:play", caught));
}

export function set_iconic_sounds_enabled(next: boolean): void {
  enabled = next && is_iconic_sounds_supported();

  if (enabled) {
    arm_warm_up();
  } else {
    disarm_warm_up();
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

  last_played_at.set(name, now);
  request_playback(name, false);

  return true;
}

export function mark_send_queued(settles_at: number): void {
  send_settles_at = Math.max(send_settles_at, settles_at);
}

export function play_send_settled_sound(): boolean {
  if (Date.now() < send_settles_at) return false;

  return play_iconic_sound("send");
}

export function preview_iconic_sound(name: IconicSound): boolean {
  if (!is_iconic_sounds_supported()) return false;

  request_playback(name, true);

  return true;
}
