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
import { useSyncExternalStore } from "react";

let own_addresses = new Set<string>();
let catch_all_domains = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function domain_of(address: string): string {
  const at = address.lastIndexOf("@");

  return at === -1 ? "" : address.slice(at + 1);
}

function notify(): void {
  version += 1;

  for (const listener of listeners) {
    listener();
  }
}

export function set_own_addresses(
  addresses: (string | null | undefined)[],
  catch_all: (string | null | undefined)[] = [],
): void {
  own_addresses = new Set(
    addresses.map(normalize).filter((value) => value.includes("@")),
  );
  catch_all_domains = new Set(
    catch_all.map(normalize).filter((value) => value.length > 0),
  );
  notify();
}

export function clear_own_addresses(): void {
  set_own_addresses([], []);
}

export function is_own_address(
  email: string | null | undefined,
  self_email: string | null | undefined,
): boolean {
  const key = normalize(email);
  const self_key = normalize(self_email);

  if (key.length === 0 || self_key.length === 0) {
    return false;
  }

  if (key === self_key || own_addresses.has(key)) {
    return true;
  }

  const domain = domain_of(key);

  return domain.length > 0 && catch_all_domains.has(domain);
}

export function is_catch_all_own_address(
  email: string | null | undefined,
): boolean {
  const domain = domain_of(normalize(email));

  return domain.length > 0 && catch_all_domains.has(domain);
}

export function own_address_among(
  addresses: (string | null | undefined)[],
  self_email: string | null | undefined,
): string | null {
  for (const address of addresses) {
    if (address && is_own_address(address, self_email)) {
      return address.trim();
    }
  }

  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): number {
  return version;
}

export function use_own_addresses_version(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
