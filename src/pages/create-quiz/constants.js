export const CATEGORY_OPTIONS = [
  { value: "history", label: "История" },
  { value: "science", label: "Наука" },
  { value: "it", label: "IT" },
  { value: "literature", label: "Литература" },
  { value: "mixed", label: "Смешанная" },
];

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 50;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const DEFAULT_QUESTIONS = 3;
export const DEFAULT_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 240;
export const DEFAULT_QUESTION_TIME_SECONDS = 30;
export const MIN_QUESTION_TIME_SECONDS = 5;
export const MAX_QUESTION_TIME_SECONDS = 600;
export const DEFAULT_MAX_ATTEMPTS = 1;
export const MAX_ATTEMPTS_PER_PARTICIPANT = 10;
export const QUESTION_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const QUESTION_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
