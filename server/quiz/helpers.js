function sanitizeSubmittedAnswers(rawAnswers) {
  if (!Array.isArray(rawAnswers)) {
    throw new Error("Ответы должны быть массивом.");
  }

  const answerMap = new Map();
  rawAnswers.forEach((rawAnswer) => {
    const questionId = Number(rawAnswer?.questionId);
    if (!Number.isInteger(questionId) || questionId < 1) {
      throw new Error("Некорректный questionId в ответах.");
    }
    if (answerMap.has(questionId)) {
      throw new Error("Дублирующийся ответ для одного вопроса.");
    }

    const rawOptionIds = Array.isArray(rawAnswer?.optionIds) ? rawAnswer.optionIds : [];
    const normalizedOptionIds = Array.from(
      new Set(
        rawOptionIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 1)
      )
    );
    answerMap.set(questionId, normalizedOptionIds);
  });

  return answerMap;
}

function scoreQuizAnswers(questions, answerMap) {
  const maxScore = questions.length;
  let score = 0;

  questions.forEach((question) => {
    const selectedOptionIds = Array.isArray(answerMap.get(question.id))
      ? answerMap.get(question.id)
      : [];
    const correctOptionIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);

    if (selectedOptionIds.length !== correctOptionIds.length) {
      return;
    }

    const selectedSet = new Set(selectedOptionIds);
    const isExactlyCorrect = correctOptionIds.every((optionId) => selectedSet.has(optionId));
    if (isExactlyCorrect) {
      score += 1;
    }
  });

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return {
    score,
    maxScore,
    percentage,
  };
}

module.exports = {
  sanitizeSubmittedAnswers,
  scoreQuizAnswers,
};
