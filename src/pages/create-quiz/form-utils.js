import {
  DEFAULT_QUESTIONS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_QUESTIONS,
} from "./constants";

export function createEmptyOption() {
  return {
    text: "",
    isCorrect: false,
  };
}

export function createEmptyQuestion() {
  return {
    type: "text",
    prompt: "",
    imageUrl: "",
    answerMode: "single",
    options: [createEmptyOption(), createEmptyOption()],
  };
}

export function buildQuestions(nextCount, currentQuestions = []) {
  const safeCount = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, nextCount));
  const questions = [...currentQuestions];
  while (questions.length < safeCount) {
    questions.push(createEmptyQuestion());
  }
  return questions.slice(0, safeCount);
}

export function normalizeQuestionForForm(rawQuestion) {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    return createEmptyQuestion();
  }

  const type = rawQuestion.type === "image" ? "image" : "text";
  const answerMode = rawQuestion.answerMode === "multiple" ? "multiple" : "single";
  const prompt = typeof rawQuestion.prompt === "string" ? rawQuestion.prompt : "";
  const imageUrl = typeof rawQuestion.imageUrl === "string" ? rawQuestion.imageUrl : "";

  let options = Array.isArray(rawQuestion.options)
    ? rawQuestion.options
        .map((option) => {
          const text = typeof option?.text === "string" ? option.text : "";
          return {
            text,
            isCorrect: Boolean(option?.isCorrect),
          };
        })
        .filter((option) => option.text.trim().length > 0)
    : [];

  if (options.length < MIN_OPTIONS) {
    options = [...options];
    while (options.length < MIN_OPTIONS) {
      options.push(createEmptyOption());
    }
  }
  if (options.length > MAX_OPTIONS) {
    options = options.slice(0, MAX_OPTIONS);
  }

  if (answerMode === "single") {
    let foundCorrect = false;
    options = options.map((option) => {
      if (option.isCorrect && !foundCorrect) {
        foundCorrect = true;
        return option;
      }
      return {
        ...option,
        isCorrect: false,
      };
    });
    if (!foundCorrect && options.length > 0) {
      options[0] = {
        ...options[0],
        isCorrect: true,
      };
    }
  }

  return {
    type,
    prompt,
    imageUrl,
    answerMode,
    options,
  };
}

export function normalizeQuestionsForForm(rawQuestions) {
  const source = Array.isArray(rawQuestions) ? rawQuestions : [];
  if (source.length === 0) {
    return buildQuestions(DEFAULT_QUESTIONS, []);
  }
  const normalized = source.map((question) => normalizeQuestionForForm(question));
  return buildQuestions(normalized.length, normalized);
}
