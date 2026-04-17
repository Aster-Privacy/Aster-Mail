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
import { NativeBiometric, type BiometryType } from "capacitor-native-biometric";

import { is_native_platform } from "./capacitor_bridge";

export interface BiometricAvailability {
  is_available: boolean;
  biometry_type: BiometryType;
  error_code?: number;
}

export async function check_biometric_availability(): Promise<BiometricAvailability> {
  if (!is_native_platform()) {
    return {
      is_available: false,
      biometry_type: 0,
    };
  }

  try {
    const result = await NativeBiometric.isAvailable();

    return {
      is_available: result.isAvailable,
      biometry_type: result.biometryType,
      error_code: result.errorCode,
    };
  } catch {
    return {
      is_available: false,
      biometry_type: 0,
    };
  }
}

export async function authenticate_biometric(
  reason: string = "Authenticate to continue",
): Promise<boolean> {
  if (!is_native_platform()) {
    return true;
  }

  const availability = await check_biometric_availability();

  if (!availability.is_available) {
    return true;
  }

  try {
    await NativeBiometric.verifyIdentity({
      reason,
      title: "Aster Mail",
      subtitle: "Verify your identity",
      description: reason,
      useFallback: true,
      maxAttempts: 3,
    });

    return true;
  } catch {
    return false;
  }
}

export async function store_biometric_credentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!is_native_platform()) {
    return false;
  }

  const availability = await check_biometric_availability();

  if (!availability.is_available) {
    return false;
  }

  try {
    await NativeBiometric.setCredentials({
      username,
      password,
      server: "com.astermail.app",
    });

    return true;
  } catch {
    return false;
  }
}

export async function get_biometric_credentials(): Promise<{
  username: string;
  password: string;
} | null> {
  if (!is_native_platform()) {
    return null;
  }

  const availability = await check_biometric_availability();

  if (!availability.is_available) {
    return null;
  }

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: "com.astermail.app",
    });

    return {
      username: credentials.username,
      password: credentials.password,
    };
  } catch {
    return null;
  }
}

export async function delete_biometric_credentials(): Promise<void> {
  if (!is_native_platform()) {
    return;
  }

  try {
    await NativeBiometric.deleteCredentials({
      server: "com.astermail.app",
    });
  } catch {}
}

export function get_biometry_type_name(type: BiometryType): string {
  switch (type) {
    case 1:
      return "Touch ID";
    case 2:
      return "Face ID";
    case 3:
      return "Fingerprint";
    case 4:
      return "Face Recognition";
    case 5:
      return "Iris";
    default:
      return "Biometric";
  }
}
