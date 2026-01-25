export function parse_csv_line(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let in_quotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (in_quotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (char === "," && !in_quotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

export function get_days_until_birthday(birthday: string): number {
  const today = new Date();
  const birth_date = new Date(birthday);
  const this_year_birthday = new Date(
    today.getFullYear(),
    birth_date.getMonth(),
    birth_date.getDate(),
  );

  if (this_year_birthday < today) {
    this_year_birthday.setFullYear(today.getFullYear() + 1);
  }

  const diff = this_year_birthday.getTime() - today.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
