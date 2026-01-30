export function sanitize_username(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function sanitize_display_name(input: string): string {
  return input
    .replace(/[<>&"']/g, "")
    .trim()
    .slice(0, 64);
}

export function validate_password_strength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number");
  }

  return { valid: errors.length === 0, errors };
}

export async function timing_safe_delay(): Promise<void> {
  const base_delay = 200;
  const random_bytes = new Uint32Array(1);

  crypto.getRandomValues(random_bytes);
  const jitter = random_bytes[0] % 100;

  await new Promise((resolve) => setTimeout(resolve, base_delay + jitter));
}
