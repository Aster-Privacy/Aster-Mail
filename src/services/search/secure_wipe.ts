export async function secure_wipe_storage_key(key: string): Promise<void> {
  if (!key || typeof key !== "string") {
    return;
  }

  const existing = localStorage.getItem(key);

  if (!existing) {
    return;
  }

  const length = existing.length;
  const random_data = crypto.getRandomValues(new Uint8Array(length));
  const random_string = Array.from(random_data)
    .map((b) => String.fromCharCode(b % 256))
    .join("");

  localStorage.setItem(key, random_string);

  const second_pass = crypto.getRandomValues(new Uint8Array(length));
  const second_string = Array.from(second_pass)
    .map((b) => String.fromCharCode(b % 256))
    .join("");

  localStorage.setItem(key, second_string);

  localStorage.removeItem(key);
}
