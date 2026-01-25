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
  } catch {
    // Ignore errors when deleting credentials
  }
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

const BIOMETRIC_APP_LOCK_KEY = "aster_biometric_app_lock";
const BIOMETRIC_SEND_KEY = "aster_biometric_send";
const BIOMETRIC_SETTINGS_KEY = "aster_biometric_settings";

export function is_biometric_app_lock_enabled(): boolean {
  return localStorage.getItem(BIOMETRIC_APP_LOCK_KEY) === "true";
}

export function set_biometric_app_lock_enabled(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_APP_LOCK_KEY, enabled ? "true" : "false");
}

export function is_biometric_send_enabled(): boolean {
  return localStorage.getItem(BIOMETRIC_SEND_KEY) === "true";
}

export function set_biometric_send_enabled(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_SEND_KEY, enabled ? "true" : "false");
}

export function is_biometric_settings_enabled(): boolean {
  return localStorage.getItem(BIOMETRIC_SETTINGS_KEY) === "true";
}

export function set_biometric_settings_enabled(enabled: boolean): void {
  localStorage.setItem(BIOMETRIC_SETTINGS_KEY, enabled ? "true" : "false");
}
