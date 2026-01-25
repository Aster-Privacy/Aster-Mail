export type ChallengeType = "math" | "text" | "image";

export interface Challenge {
  id: string;
  question: string;
  visual_data?: string;
  type: ChallengeType;
  answer: string;
}

const challenges: Map<string, Challenge> = new Map();

function generate_id(): string {
  const bytes = new Uint8Array(12);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secure_random_int(max: number): number {
  const bytes = new Uint32Array(1);

  crypto.getRandomValues(bytes);

  return bytes[0] % max;
}

function generate_math_challenge(): Challenge {
  const a = secure_random_int(10) + 1;
  const b = secure_random_int(10) + 1;
  const operators = ["+", "-", "*"];
  const op = operators[secure_random_int(operators.length)];

  let answer: number;

  switch (op) {
    case "+":
      answer = a + b;
      break;
    case "-":
      answer = a - b;
      break;
    case "*":
      answer = a * b;
      break;
    default:
      answer = a + b;
  }

  return {
    id: generate_id(),
    question: `What is ${a} ${op} ${b}?`,
    type: "math",
    answer: answer.toString(),
  };
}

function generate_text_challenge(): Challenge {
  const words = [
    "apple",
    "banana",
    "orange",
    "grape",
    "melon",
    "cherry",
    "peach",
    "mango",
  ];
  const word = words[secure_random_int(words.length)];
  const position = secure_random_int(word.length) + 1;

  return {
    id: generate_id(),
    question: `What is letter #${position} in "${word}"?`,
    type: "text",
    answer: word[position - 1],
  };
}

export async function generate_challenge(
  type?: ChallengeType,
): Promise<Challenge> {
  const challenge_type = type || (secure_random_int(2) === 0 ? "math" : "text");

  let challenge: Challenge;

  if (challenge_type === "math") {
    challenge = generate_math_challenge();
  } else {
    challenge = generate_text_challenge();
  }

  challenges.set(challenge.id, challenge);

  setTimeout(
    () => {
      challenges.delete(challenge.id);
    },
    2 * 60 * 1000,
  );

  return {
    id: challenge.id,
    question: challenge.question,
    visual_data: challenge.visual_data,
    type: challenge.type,
    answer: "",
  };
}

export async function verify_challenge(
  id: string,
  answer: string,
): Promise<boolean> {
  const challenge = challenges.get(id);

  if (!challenge) {
    return false;
  }

  const is_correct =
    challenge.answer.toLowerCase() === answer.toLowerCase().trim();

  if (is_correct) {
    challenges.delete(id);
  }

  return is_correct;
}
