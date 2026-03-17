import {
  buildQuestions,
  createEmptyOption,
  createEmptyQuestion,
  normalizeQuestionForForm,
  normalizeQuestionsForForm,
} from "./form-utils";
import { DEFAULT_QUESTIONS, MAX_OPTIONS, MAX_QUESTIONS, MIN_QUESTIONS } from "./constants";

describe("create-quiz/form-utils", () => {
  test("createEmptyOption returns default empty option", () => {
    expect(createEmptyOption()).toEqual({
      text: "",
      isCorrect: false,
    });
  });

  test("createEmptyQuestion returns default text question with two empty options", () => {
    expect(createEmptyQuestion()).toEqual({
      type: "text",
      prompt: "",
      imageUrl: "",
      answerMode: "single",
      options: [createEmptyOption(), createEmptyOption()],
    });
  });

  test("buildQuestions preserves current questions and appends empty ones up to requested count", () => {
    const existingQuestion = { prompt: "Existing question" };

    const result = buildQuestions(3, [existingQuestion]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(existingQuestion);
    expect(result[1]).toEqual(createEmptyQuestion());
    expect(result[2]).toEqual(createEmptyQuestion());
  });

  test("buildQuestions clamps requested count to configured bounds", () => {
    expect(buildQuestions(0, [])).toHaveLength(MIN_QUESTIONS);
    expect(buildQuestions(MAX_QUESTIONS + 10, new Array(MAX_QUESTIONS + 10).fill({}))).toHaveLength(
      MAX_QUESTIONS
    );
  });

  test("normalizeQuestionForForm normalizes invalid shape, filters empty options and keeps only one correct answer in single mode", () => {
    const result = normalizeQuestionForForm({
      type: "image",
      answerMode: "single",
      prompt: "Question prompt",
      imageUrl: "https://example.com/image.png",
      options: [
        { text: "First", isCorrect: true },
        { text: "   " },
        { text: "Second", isCorrect: true },
      ],
    });

    expect(result).toEqual({
      type: "image",
      prompt: "Question prompt",
      imageUrl: "https://example.com/image.png",
      answerMode: "single",
      options: [
        { text: "First", isCorrect: true },
        { text: "Second", isCorrect: false },
      ],
    });
  });

  test("normalizeQuestionForForm pads missing options and sets the first option correct when single mode has no correct answer", () => {
    const result = normalizeQuestionForForm({
      answerMode: "single",
      options: [{ text: "Only option", isCorrect: false }],
    });

    expect(result.options).toEqual([
      { text: "Only option", isCorrect: true },
      { text: "", isCorrect: false },
    ]);
  });

  test("normalizeQuestionForForm truncates options to MAX_OPTIONS in multiple mode", () => {
    const result = normalizeQuestionForForm({
      answerMode: "multiple",
      options: Array.from({ length: MAX_OPTIONS + 2 }, (_, index) => ({
        text: `Option ${index + 1}`,
        isCorrect: index % 2 === 0,
      })),
    });

    expect(result.options).toHaveLength(MAX_OPTIONS);
    expect(result.options[0]).toEqual({ text: "Option 1", isCorrect: true });
    expect(result.options[MAX_OPTIONS - 1]).toEqual({
      text: `Option ${MAX_OPTIONS}`,
      isCorrect: MAX_OPTIONS % 2 === 1,
    });
  });

  test("normalizeQuestionsForForm returns default amount of empty questions for empty input", () => {
    const result = normalizeQuestionsForForm([]);

    expect(result).toHaveLength(DEFAULT_QUESTIONS);
    result.forEach((question) => {
      expect(question).toEqual(createEmptyQuestion());
    });
  });

  test("normalizeQuestionsForForm normalizes each question and keeps source length", () => {
    const result = normalizeQuestionsForForm([
      {
        prompt: "Question 1",
        options: [{ text: "One", isCorrect: true }, { text: "Two", isCorrect: false }],
      },
      null,
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].prompt).toBe("Question 1");
    expect(result[1]).toEqual(createEmptyQuestion());
  });
});
