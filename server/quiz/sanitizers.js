const {
  MAX_QUIZ_QUESTIONS,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_OPTION_TEXT_LENGTH,
  MAX_QUESTION_OPTIONS,
} = require("../config/env");

function sanitizeQuizRules(rawRules) {
  const source = rawRules && typeof rawRules === "object" ? rawRules : {};
  return {
    allowBackNavigation: Boolean(source.allowBackNavigation),
    showCorrectAfterAnswer: Boolean(source.showCorrectAfterAnswer),
    shuffleQuestions: Boolean(source.shuffleQuestions),
  };
}

function sanitizeQuizQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error("Добавьте хотя бы один вопрос.");
  }
  if (rawQuestions.length > MAX_QUIZ_QUESTIONS) {
    throw new Error(`Количество вопросов не должно превышать ${MAX_QUIZ_QUESTIONS}.`);
  }

  return rawQuestions.map((rawQuestion, questionIndex) => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      throw new Error(`Неверный формат вопроса №${questionIndex + 1}.`);
    }

    const type = rawQuestion.type === "image" ? "image" : "text";
    const answerMode = rawQuestion.answerMode === "multiple" ? "multiple" : "single";
    const prompt = typeof rawQuestion.prompt === "string" ? rawQuestion.prompt.trim() : "";
    const imageUrl = typeof rawQuestion.imageUrl === "string" ? rawQuestion.imageUrl.trim() : "";

    if (!prompt) {
      throw new Error(`Заполните текст вопроса №${questionIndex + 1}.`);
    }
    if (prompt.length > MAX_QUESTION_TEXT_LENGTH) {
      throw new Error(
        `Текст вопроса №${questionIndex + 1} не должен превышать ${MAX_QUESTION_TEXT_LENGTH} символов.`
      );
    }
    if (type === "image" && !imageUrl) {
      throw new Error(`Загрузите изображение для вопроса №${questionIndex + 1}.`);
    }

    const rawOptions = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
    if (rawOptions.length < 2) {
      throw new Error(`Вопрос №${questionIndex + 1} должен содержать минимум 2 варианта ответа.`);
    }
    if (rawOptions.length > MAX_QUESTION_OPTIONS) {
      throw new Error(
        `Вопрос №${questionIndex + 1} не должен содержать более ${MAX_QUESTION_OPTIONS} вариантов ответа.`
      );
    }

    const options = rawOptions.map((rawOption, optionIndex) => {
      const text = typeof rawOption?.text === "string" ? rawOption.text.trim() : "";
      if (!text) {
        throw new Error(
          `Заполните текст варианта ${optionIndex + 1} в вопросе №${questionIndex + 1}.`
        );
      }
      if (text.length > MAX_OPTION_TEXT_LENGTH) {
        throw new Error(
          `Вариант ${optionIndex + 1} в вопросе №${questionIndex + 1} не должен превышать ${MAX_OPTION_TEXT_LENGTH} символов.`
        );
      }

      return {
        id: optionIndex + 1,
        text,
        isCorrect: Boolean(rawOption.isCorrect),
      };
    });

    const correctOptionsCount = options.filter((option) => option.isCorrect).length;
    if (correctOptionsCount === 0) {
      throw new Error(`В вопросе №${questionIndex + 1} отметьте хотя бы один правильный ответ.`);
    }
    if (answerMode === "single" && correctOptionsCount !== 1) {
      throw new Error(
        `Для одиночного выбора в вопросе №${questionIndex + 1} должен быть один правильный ответ.`
      );
    }

    return {
      id: questionIndex + 1,
      type,
      prompt,
      imageUrl,
      answerMode,
      options,
    };
  });
}

module.exports = {
  sanitizeQuizRules,
  sanitizeQuizQuestions,
};
