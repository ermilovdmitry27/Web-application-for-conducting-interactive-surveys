const { DEFAULT_QUIZ_QUESTION_TIME_SECONDS } = require("../../../server/config/env");
const {
  buildDisplayName,
  mapAttemptCommon,
  mapDbQuiz,
  mapDbUser,
  mapLiveQuizFromRow,
  mapLiveSessionFromRow,
  mapQuizForParticipant,
  normalizeNamePart,
} = require("../../../server/mappers");

describe("server/mappers", () => {
  test("mapDbUser normalizes nullable user fields", () => {
    expect(
      mapDbUser({
        id: 1,
        name: "Иванов Иван",
        first_name: null,
        last_name: undefined,
        middle_name: null,
        email: "user@example.com",
        role: "participant",
        avatar_data_url: null,
      })
    ).toEqual({
      id: 1,
      name: "Иванов Иван",
      firstName: "",
      lastName: "",
      middleName: "",
      email: "user@example.com",
      role: "participant",
      avatarDataUrl: "",
    });
  });

  test("normalizeNamePart trims and collapses whitespace", () => {
    expect(normalizeNamePart("  Ada   Lovelace  ")).toBe("Ada Lovelace");
    expect(normalizeNamePart(null)).toBe("");
  });

  test("buildDisplayName joins non-empty last, first and middle names", () => {
    expect(
      buildDisplayName({
        firstName: "Иван",
        lastName: "Иванов",
        middleName: "Иванович",
      })
    ).toBe("Иванов Иван Иванович");

    expect(
      buildDisplayName({
        firstName: "Ada",
        lastName: "",
        middleName: "",
      })
    ).toBe("Ada");
  });

  test("mapDbQuiz normalizes questions, rules and nullable fields", () => {
    expect(
      mapDbQuiz({
        id: 10,
        organizer_id: 3,
        title: "Demo quiz",
        description: null,
        category: null,
        join_code: "ABCDE1",
        is_active: true,
        time_limit_minutes: 15,
        question_time_seconds: 0,
        max_attempts_per_participant: 0,
        rules_json: {
          allowBackNavigation: 1,
          showCorrectAfterAnswer: 0,
          shuffleQuestions: "yes",
        },
        questions_json: [
          "Legacy question",
          {
            type: "image",
            prompt: "Question 2",
            imageUrl: "https://example.com/q2.png",
            answerMode: "multiple",
            options: [
              { text: "A", isCorrect: true },
              null,
              { text: "B", isCorrect: false },
            ],
          },
          null,
        ],
        created_at: "2025-03-10T10:00:00.000Z",
      })
    ).toEqual({
      id: 10,
      organizerId: 3,
      title: "Demo quiz",
      description: "",
      category: "general",
      joinCode: "ABCDE1",
      isActive: true,
      durationMinutes: 15,
      questionTimeSeconds: 450,
      maxAttemptsPerParticipant: 1,
      questionCount: 2,
      questions: [
        {
          id: 1,
          type: "text",
          prompt: "Legacy question",
          imageUrl: "",
          answerMode: "single",
          options: [
            { id: 1, text: "Да", isCorrect: true },
            { id: 2, text: "Нет", isCorrect: false },
          ],
        },
        {
          id: 2,
          type: "image",
          prompt: "Question 2",
          imageUrl: "https://example.com/q2.png",
          answerMode: "multiple",
          options: [
            { id: 1, text: "A", isCorrect: true },
            { id: 3, text: "B", isCorrect: false },
          ],
        },
      ],
      rules: {
        allowBackNavigation: true,
        showCorrectAfterAnswer: false,
        shuffleQuestions: true,
      },
      createdAt: "2025-03-10T10:00:00.000Z",
    });
  });

  test("mapDbQuiz falls back to DEFAULT_QUIZ_QUESTION_TIME_SECONDS when there are no questions", () => {
    const result = mapDbQuiz({
      id: 11,
      organizer_id: 3,
      title: "Empty quiz",
      description: "",
      category: "science",
      join_code: "EMPTY1",
      is_active: false,
      time_limit_minutes: 0,
      question_time_seconds: 0,
      max_attempts_per_participant: 2,
      rules_json: null,
      questions_json: null,
      created_at: null,
    });

    expect(result.questionCount).toBe(0);
    expect(result.questionTimeSeconds).toBe(DEFAULT_QUIZ_QUESTION_TIME_SECONDS);
  });

  test("mapQuizForParticipant keeps participant-safe payload without correctness metadata", () => {
    const result = mapQuizForParticipant({
      id: 20,
      organizer_id: 7,
      title: "Participant quiz",
      description: "Desc",
      category: "history",
      join_code: "PART11",
      is_active: true,
      time_limit_minutes: 10,
      question_time_seconds: 30,
      max_attempts_per_participant: 2,
      rules_json: { allowBackNavigation: true },
      questions_json: [
        {
          prompt: "Question",
          options: [
            { text: "A", isCorrect: true },
            { text: "B", isCorrect: false },
          ],
        },
      ],
      created_at: "2025-03-10T10:00:00.000Z",
    });

    expect(result).toEqual({
      id: 20,
      title: "Participant quiz",
      description: "Desc",
      category: "history",
      joinCode: "PART11",
      isActive: true,
      durationMinutes: 10,
      questionTimeSeconds: 30,
      maxAttemptsPerParticipant: 2,
      questionCount: 1,
      rules: {
        allowBackNavigation: true,
        showCorrectAfterAnswer: false,
        shuffleQuestions: false,
      },
      questions: [
        {
          id: 1,
          type: "text",
          prompt: "Question",
          imageUrl: "",
          answerMode: "single",
          options: [
            { id: 1, text: "A" },
            { id: 2, text: "B" },
          ],
        },
      ],
    });
    expect(result).not.toHaveProperty("organizerId");
    expect(result.questions[0].options[0]).not.toHaveProperty("isCorrect");
  });

  test("mapLiveQuizFromRow maps prefixed quiz row fields", () => {
    expect(
      mapLiveQuizFromRow({
        quiz_id: 5,
        quiz_organizer_id: 9,
        quiz_title: "Live quiz",
        quiz_description: null,
        quiz_category: null,
        quiz_join_code: "LIVE01",
        quiz_is_active: true,
        quiz_time_limit_minutes: 20,
        quiz_question_time_seconds: 25,
        quiz_max_attempts_per_participant: 3,
        quiz_rules_json: { shuffleQuestions: true },
        quiz_questions_json: [
          {
            prompt: "Live question",
            options: [
              { text: "Yes", isCorrect: true },
              { text: "No", isCorrect: false },
            ],
          },
        ],
        quiz_created_at: "2025-03-10T10:00:00.000Z",
      })
    ).toMatchObject({
      id: 5,
      organizerId: 9,
      title: "Live quiz",
      joinCode: "LIVE01",
      questionTimeSeconds: 25,
      questionCount: 1,
      rules: {
        allowBackNavigation: false,
        showCorrectAfterAnswer: false,
        shuffleQuestions: true,
      },
    });
  });

  test("mapLiveSessionFromRow filters invalid question order values and normalizes nullable timing fields", () => {
    expect(
      mapLiveSessionFromRow({
        session_id: 50,
        session_quiz_id: 5,
        organizer_id: 9,
        session_status: "running",
        is_live_started: 1,
        is_paused: 0,
        current_question_index: "2",
        question_order_json: [0, "1", -1, "x", 3],
        current_question_started_at: null,
        paused_at: "",
        paused_remaining_seconds: -4,
        started_at: "2025-03-10T10:00:00.000Z",
        finished_at: null,
      })
    ).toEqual({
      id: 50,
      quizId: 5,
      organizerId: 9,
      status: "running",
      isLiveStarted: true,
      isPaused: false,
      currentQuestionIndex: 2,
      questionOrder: [0, 1, 3],
      currentQuestionStartedAt: "2025-03-10T10:00:00.000Z",
      pausedAt: null,
      pausedRemainingSeconds: 0,
      startedAt: "2025-03-10T10:00:00.000Z",
      finishedAt: null,
    });
  });

  test("mapAttemptCommon returns attempt payload with score stats and live flags", () => {
    expect(
      mapAttemptCommon({
        id: 70,
        score: "2",
        max_score: "3",
        answers_json: [
          { optionIds: [1] },
          { optionIds: [] },
          {},
        ],
        time_spent_seconds: "95",
        live_session_id: "12",
        created_at: "2025-03-10T10:00:00.000Z",
      })
    ).toEqual({
      id: 70,
      score: 2,
      maxScore: 3,
      percentage: 67,
      answers: [
        { optionIds: [1] },
        { optionIds: [] },
        {},
      ],
      answeredQuestionsCount: 1,
      timeSpentSeconds: 95,
      liveSessionId: 12,
      isLive: true,
      createdAt: "2025-03-10T10:00:00.000Z",
    });
  });

  test("mapAttemptCommon falls back for missing answers and invalid live session id", () => {
    expect(
      mapAttemptCommon({
        id: 71,
        score: 0,
        max_score: 0,
        answers_json: null,
        time_spent_seconds: null,
        live_session_id: "invalid",
        created_at: null,
      })
    ).toEqual({
      id: 71,
      score: 0,
      maxScore: 0,
      percentage: 0,
      answers: [],
      answeredQuestionsCount: 0,
      timeSpentSeconds: 0,
      liveSessionId: null,
      isLive: false,
      createdAt: null,
    });
  });
});
