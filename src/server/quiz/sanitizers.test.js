const {
  MAX_OPTION_TEXT_LENGTH,
  MAX_QUESTION_OPTIONS,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_QUIZ_QUESTIONS,
} = require("../../../server/config/env");
const { sanitizeQuizQuestions, sanitizeQuizRules } = require("../../../server/quiz/sanitizers");

describe("server/quiz/sanitizers", () => {
  describe("sanitizeQuizRules", () => {
    test("returns normalized boolean flags", () => {
      expect(
        sanitizeQuizRules({
          allowBackNavigation: 1,
          showCorrectAfterAnswer: "yes",
          shuffleQuestions: 0,
        })
      ).toEqual({
        allowBackNavigation: true,
        showCorrectAfterAnswer: true,
        shuffleQuestions: false,
      });
    });

    test("falls back to all false for invalid input", () => {
      expect(sanitizeQuizRules(null)).toEqual({
        allowBackNavigation: false,
        showCorrectAfterAnswer: false,
        shuffleQuestions: false,
      });
    });
  });

  describe("sanitizeQuizQuestions", () => {
    test("sanitizes valid single and multiple choice questions", () => {
      expect(
        sanitizeQuizQuestions([
          {
            type: "image",
            prompt: "  Сколько будет 2 + 2?  ",
            imageUrl: "  https://example.com/q1.png  ",
            answerMode: "single",
            options: [
              { text: "  4 ", isCorrect: true },
              { text: " 5 ", isCorrect: false },
            ],
          },
          {
            type: "text",
            prompt: "Выберите простые числа",
            imageUrl: "ignored",
            answerMode: "multiple",
            options: [
              { text: "2", isCorrect: true },
              { text: "3", isCorrect: true },
              { text: "4", isCorrect: false },
            ],
          },
        ])
      ).toEqual([
        {
          id: 1,
          type: "image",
          prompt: "Сколько будет 2 + 2?",
          imageUrl: "https://example.com/q1.png",
          answerMode: "single",
          options: [
            { id: 1, text: "4", isCorrect: true },
            { id: 2, text: "5", isCorrect: false },
          ],
        },
        {
          id: 2,
          type: "text",
          prompt: "Выберите простые числа",
          imageUrl: "ignored",
          answerMode: "multiple",
          options: [
            { id: 1, text: "2", isCorrect: true },
            { id: 2, text: "3", isCorrect: true },
            { id: 3, text: "4", isCorrect: false },
          ],
        },
      ]);
    });

    test("throws when there are no questions", () => {
      expect(() => sanitizeQuizQuestions([])).toThrow("Добавьте хотя бы один вопрос.");
    });

    test("throws when question count exceeds configured limit", () => {
      expect(() =>
        sanitizeQuizQuestions(
          Array.from({ length: MAX_QUIZ_QUESTIONS + 1 }, () => ({
            prompt: "Q",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          }))
        )
      ).toThrow(`Количество вопросов не должно превышать ${MAX_QUIZ_QUESTIONS}.`);
    });

    test("throws when question prompt is empty", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "   ",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow("Заполните текст вопроса №1.");
    });

    test("throws when image question has no image", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            type: "image",
            prompt: "Question",
            imageUrl: "   ",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow("Загрузите изображение для вопроса №1.");
    });

    test("throws when question has too few or too many options", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            options: [{ text: "A", isCorrect: true }],
          },
        ])
      ).toThrow("Вопрос №1 должен содержать минимум 2 варианта ответа.");

      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            options: Array.from({ length: MAX_QUESTION_OPTIONS + 1 }, (_, index) => ({
              text: `Option ${index + 1}`,
              isCorrect: index === 0,
            })),
          },
        ])
      ).toThrow(
        `Вопрос №1 не должен содержать более ${MAX_QUESTION_OPTIONS} вариантов ответа.`
      );
    });

    test("throws when question or option text exceeds configured limits", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Q".repeat(MAX_QUESTION_TEXT_LENGTH + 1),
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow(
        `Текст вопроса №1 не должен превышать ${MAX_QUESTION_TEXT_LENGTH} символов.`
      );

      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            options: [
              { text: "A".repeat(MAX_OPTION_TEXT_LENGTH + 1), isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow(
        `Вариант 1 в вопросе №1 не должен превышать ${MAX_OPTION_TEXT_LENGTH} символов.`
      );
    });

    test("throws when option text is empty", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            options: [
              { text: "   ", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow("Заполните текст варианта 1 в вопросе №1.");
    });

    test("throws when there are no correct answers", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            options: [
              { text: "A", isCorrect: false },
              { text: "B", isCorrect: false },
            ],
          },
        ])
      ).toThrow("В вопросе №1 отметьте хотя бы один правильный ответ.");
    });

    test("throws when single-choice question has multiple correct answers", () => {
      expect(() =>
        sanitizeQuizQuestions([
          {
            prompt: "Question",
            answerMode: "single",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: true },
            ],
          },
        ])
      ).toThrow("Для одиночного выбора в вопросе №1 должен быть один правильный ответ.");
    });
  });
});
