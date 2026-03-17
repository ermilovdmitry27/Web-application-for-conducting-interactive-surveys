const { sanitizeSubmittedAnswers, scoreQuizAnswers } = require("../../../server/quiz/helpers");

describe("server/quiz/helpers", () => {
  describe("sanitizeSubmittedAnswers", () => {
    test("returns question answer map with unique normalized option ids", () => {
      const result = sanitizeSubmittedAnswers([
        { questionId: "1", optionIds: [2, "2", 3, 0, "x"] },
        { questionId: 2, optionIds: [1, 1, 4] },
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(Array.from(result.entries())).toEqual([
        [1, [2, 3]],
        [2, [1, 4]],
      ]);
    });

    test("throws for non-array input", () => {
      expect(() => sanitizeSubmittedAnswers(null)).toThrow("Ответы должны быть массивом.");
    });

    test("throws for invalid question id", () => {
      expect(() => sanitizeSubmittedAnswers([{ questionId: 0, optionIds: [] }])).toThrow(
        "Некорректный questionId в ответах."
      );
    });

    test("throws for duplicate answers to the same question", () => {
      expect(() =>
        sanitizeSubmittedAnswers([
          { questionId: 1, optionIds: [1] },
          { questionId: 1, optionIds: [2] },
        ])
      ).toThrow("Дублирующийся ответ для одного вопроса.");
    });
  });

  describe("scoreQuizAnswers", () => {
    const questions = [
      {
        id: 1,
        options: [
          { id: 1, isCorrect: true },
          { id: 2, isCorrect: false },
        ],
      },
      {
        id: 2,
        options: [
          { id: 1, isCorrect: true },
          { id: 2, isCorrect: true },
          { id: 3, isCorrect: false },
        ],
      },
      {
        id: 3,
        options: [
          { id: 1, isCorrect: false },
          { id: 2, isCorrect: true },
        ],
      },
    ];

    test("counts exact matches for single and multiple choice questions", () => {
      const answerMap = new Map([
        [1, [1]],
        [2, [1, 2]],
        [3, [2]],
      ]);

      expect(scoreQuizAnswers(questions, answerMap)).toEqual({
        score: 3,
        maxScore: 3,
        percentage: 100,
      });
    });

    test("does not count partial or oversized selections as correct", () => {
      const answerMap = new Map([
        [1, [1, 2]],
        [2, [1]],
        [3, [1]],
      ]);

      expect(scoreQuizAnswers(questions, answerMap)).toEqual({
        score: 0,
        maxScore: 3,
        percentage: 0,
      });
    });

    test("rounds percentage from total score", () => {
      const answerMap = new Map([
        [1, [1]],
        [2, [1]],
        [3, [2]],
      ]);

      expect(scoreQuizAnswers(questions, answerMap)).toEqual({
        score: 2,
        maxScore: 3,
        percentage: 67,
      });
    });

    test("returns zero percentage for empty quiz", () => {
      expect(scoreQuizAnswers([], new Map())).toEqual({
        score: 0,
        maxScore: 0,
        percentage: 0,
      });
    });
  });
});
