const crypto = require("crypto");
const { DEFAULT_QUIZ_QUESTION_TIME_SECONDS } = require("../../../server/config/env");
const {
  buildDefaultQuestionOrder,
  normalizeQuestionOrder,
  createLiveQuestionOrder,
  getLiveQuestionBySessionIndex,
  getLiveQuestionTimeLimitSeconds,
  getLiveQuestionRemainingSeconds,
  getLiveQuestionResponseSeconds,
  toLiveQuestionPayload,
  buildLiveSessionState,
  buildLiveAttemptAnswers,
  getLiveAttemptTimeSpentSeconds,
  buildLiveStatePair,
} = require("../../../server/live/helpers");

describe("server/live/helpers", () => {
  const quiz = {
    id: 10,
    title: "Live Demo",
    joinCode: "LIVE01",
    durationMinutes: 9,
    questionTimeSeconds: 30,
    rules: {
      allowBackNavigation: false,
      showCorrectAfterAnswer: false,
      shuffleQuestions: false,
    },
    questions: [
      {
        id: 101,
        type: "text",
        prompt: "Question 1",
        imageUrl: "",
        answerMode: "single",
        options: [
          { id: 1, text: "A1", isCorrect: true },
          { id: 2, text: "A2", isCorrect: false },
        ],
      },
      {
        id: 102,
        type: "image",
        prompt: "Question 2",
        imageUrl: "https://example.com/q2.png",
        answerMode: "multiple",
        options: [
          { id: 1, text: "B1", isCorrect: true },
          { id: 2, text: "B2", isCorrect: true },
          { id: 3, text: "B3", isCorrect: false },
        ],
      },
      {
        id: 103,
        type: "text",
        prompt: "Question 3",
        imageUrl: "",
        answerMode: "single",
        options: [
          { id: 1, text: "C1", isCorrect: false },
          { id: 2, text: "C2", isCorrect: true },
        ],
      },
    ],
  };

  const session = {
    id: 20,
    status: "running",
    isLiveStarted: true,
    isPaused: false,
    currentQuestionIndex: 1,
    questionOrder: [2, 0, 1],
    currentQuestionStartedAt: "2025-03-10T10:00:10.000Z",
    pausedAt: null,
    pausedRemainingSeconds: 0,
    startedAt: "2025-03-10T10:00:00.000Z",
    finishedAt: null,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("buildDefaultQuestionOrder creates sequential order and handles invalid count", () => {
    expect(buildDefaultQuestionOrder(4)).toEqual([0, 1, 2, 3]);
    expect(buildDefaultQuestionOrder(0)).toEqual([]);
    expect(buildDefaultQuestionOrder("3")).toEqual([]);
  });

  test("normalizeQuestionOrder keeps valid order and falls back for invalid permutations", () => {
    expect(normalizeQuestionOrder([2, 0, 1], 3)).toEqual([2, 0, 1]);
    expect(normalizeQuestionOrder([2, 0], 3)).toEqual([0, 1, 2]);
    expect(normalizeQuestionOrder([2, 2, 1], 3)).toEqual([0, 1, 2]);
    expect(normalizeQuestionOrder([2, 0, 5], 3)).toEqual([0, 1, 2]);
  });

  test("createLiveQuestionOrder keeps default order when shuffle is off and shuffles deterministically when enabled", () => {
    expect(createLiveQuestionOrder(quiz)).toEqual([0, 1, 2]);

    jest.spyOn(crypto, "randomInt").mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(
      createLiveQuestionOrder({
        ...quiz,
        rules: { ...quiz.rules, shuffleQuestions: true },
      })
    ).toEqual([1, 2, 0]);
  });

  test("getLiveQuestionBySessionIndex returns session-selected question and null for invalid index", () => {
    expect(getLiveQuestionBySessionIndex(session, quiz, 1)).toEqual({
      question: quiz.questions[0],
      actualQuestionIndex: 0,
      questionOrder: [2, 0, 1],
    });
    expect(getLiveQuestionBySessionIndex(session, quiz, 99)).toBeNull();
  });

  test("getLiveQuestionTimeLimitSeconds uses explicit value or fallbacks", () => {
    expect(getLiveQuestionTimeLimitSeconds({ ...quiz, questionTimeSeconds: 42.8 })).toBe(42);
    expect(
      getLiveQuestionTimeLimitSeconds({
        questions: [{ id: 1 }, { id: 2 }],
        durationMinutes: 1,
        questionTimeSeconds: 0,
      })
    ).toBe(30);
    expect(getLiveQuestionTimeLimitSeconds({ questions: [], questionTimeSeconds: 0 })).toBe(
      DEFAULT_QUIZ_QUESTION_TIME_SECONDS
    );
  });

  test("getLiveQuestionRemainingSeconds handles non-running, paused, invalid and elapsed-time cases", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2025-03-10T10:00:25.000Z").getTime());

    expect(getLiveQuestionRemainingSeconds({ ...session, status: "finished" }, 30)).toBe(0);
    expect(
      getLiveQuestionRemainingSeconds({ ...session, isPaused: true, pausedRemainingSeconds: 7 }, 30)
    ).toBe(7);
    expect(
      getLiveQuestionRemainingSeconds({ ...session, currentQuestionStartedAt: "invalid" }, 30)
    ).toBe(30);
    expect(getLiveQuestionRemainingSeconds(session, 30)).toBe(15);
  });

  test("getLiveQuestionResponseSeconds returns clamped elapsed time and zero for invalid timestamps", () => {
    expect(
      getLiveQuestionResponseSeconds(session, 30, "2025-03-10T10:00:29.000Z")
    ).toBe(19);
    expect(
      getLiveQuestionResponseSeconds(session, 10, "2025-03-10T10:00:40.000Z")
    ).toBe(10);
    expect(getLiveQuestionResponseSeconds(session, 30, "invalid")).toBe(0);
  });

  test("toLiveQuestionPayload includes correctness only when requested", () => {
    expect(toLiveQuestionPayload(quiz.questions[1], 1, false)).toEqual({
      index: 1,
      id: 102,
      type: "image",
      prompt: "Question 2",
      imageUrl: "https://example.com/q2.png",
      answerMode: "multiple",
      options: [
        { id: 1, text: "B1" },
        { id: 2, text: "B2" },
        { id: 3, text: "B3" },
      ],
    });

    expect(toLiveQuestionPayload(quiz.questions[1], 1, true).options[0]).toEqual({
      id: 1,
      text: "B1",
      isCorrect: true,
    });
    expect(toLiveQuestionPayload(null, 0, true)).toBeNull();
  });

  test("buildLiveSessionState builds participant-safe current question state and counts answered participants", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2025-03-10T10:00:20.000Z").getTime());

    const result = buildLiveSessionState({
      session,
      quiz,
      participantsCount: 3,
      participants: [{ participantId: 1 }],
      answeredParticipants: [{ participantId: 2 }],
      includeCorrect: false,
    });

    expect(result).toMatchObject({
      sessionId: 20,
      quizId: 10,
      quizTitle: "Live Demo",
      joinCode: "LIVE01",
      status: "running",
      isLiveStarted: true,
      isPaused: false,
      currentQuestionIndex: 1,
      questionCount: 3,
      participantsCount: 3,
      participants: [{ participantId: 1 }],
      currentQuestionAnswersCount: 1,
      currentQuestionAnsweredParticipants: [{ participantId: 2 }],
      questionTimeLimitSeconds: 30,
      questionRemainingSeconds: 20,
    });
    expect(result.currentQuestion).toEqual({
      index: 1,
      id: 101,
      type: "text",
      prompt: "Question 1",
      imageUrl: "",
      answerMode: "single",
      options: [
        { id: 1, text: "A1" },
        { id: 2, text: "A2" },
      ],
    });
  });

  test("buildLiveStatePair falls back to participants length when context has no participantsCount", () => {
    const result = buildLiveStatePair(
      {
        session,
        quiz,
      },
      [{ participantId: 1 }, { participantId: 2 }],
      [{ participantId: 2 }]
    );

    expect(result.organizerState.participantsCount).toBe(2);
    expect(result.participantState.participantsCount).toBe(2);
    expect(result.organizerState.currentQuestionAnswersCount).toBe(1);
  });

  test("buildLiveAttemptAnswers shapes answers using session order and selected option texts", () => {
    expect(
      buildLiveAttemptAnswers(
        { session, quiz },
        [
          {
            question_index: 0,
            selected_option_ids_json: [2, "1", 0],
            is_correct: true,
            submitted_after_seconds: 12,
            submitted_at: "2025-03-10T10:00:12.000Z",
          },
          {
            question_index: 2,
            selected_option_ids_json: [],
            is_correct: false,
            submitted_after_seconds: 0,
            submitted_at: null,
          },
        ]
      )
    ).toEqual([
      {
        questionId: 103,
        questionPosition: 1,
        prompt: "Question 3",
        type: "text",
        answerMode: "single",
        optionIds: [2, 1],
        optionTexts: ["C1", "C2"],
        isCorrect: true,
        wasAnswered: true,
        submittedAfterSeconds: 12,
        submittedAt: "2025-03-10T10:00:12.000Z",
      },
      {
        questionId: 101,
        questionPosition: 2,
        prompt: "Question 1",
        type: "text",
        answerMode: "single",
        optionIds: [],
        optionTexts: [],
        isCorrect: false,
        wasAnswered: false,
        submittedAfterSeconds: 0,
        submittedAt: null,
      },
      {
        questionId: 102,
        questionPosition: 3,
        prompt: "Question 2",
        type: "image",
        answerMode: "multiple",
        optionIds: [],
        optionTexts: [],
        isCorrect: false,
        wasAnswered: false,
        submittedAfterSeconds: 0,
        submittedAt: null,
      },
    ]);
  });

  test("getLiveAttemptTimeSpentSeconds uses latest answer or finished session time and guards invalid dates", () => {
    expect(
      getLiveAttemptTimeSpentSeconds(
        { session: { ...session, finishedAt: "2025-03-10T10:01:00.000Z" } },
        "2025-03-10T10:00:05.000Z",
        [
          { submitted_at: "2025-03-10T10:00:10.000Z" },
          { submitted_at: "2025-03-10T10:00:30.000Z" },
        ]
      )
    ).toBe(25);

    expect(
      getLiveAttemptTimeSpentSeconds(
        { session: { ...session, finishedAt: "2025-03-10T10:01:00.000Z" } },
        "2025-03-10T10:00:05.000Z",
        []
      )
    ).toBe(55);

    expect(getLiveAttemptTimeSpentSeconds({ session }, "invalid", [])).toBe(0);
  });

  test("buildLiveStatePair returns organizer and participant variants with different visibility", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2025-03-10T10:00:20.000Z").getTime());

    const result = buildLiveStatePair(
      {
        session,
        quiz,
        participantsCount: 2,
      },
      [{ participantId: 1 }],
      [{ participantId: 2 }]
    );

    expect(result.organizerState.participants).toEqual([{ participantId: 1 }]);
    expect(result.organizerState.currentQuestionAnsweredParticipants).toEqual([{ participantId: 2 }]);
    expect(result.organizerState.currentQuestion.options[0]).toHaveProperty("isCorrect");

    expect(result.participantState.participants).toEqual([]);
    expect(result.participantState.currentQuestionAnsweredParticipants).toEqual([]);
    expect(result.participantState.currentQuestion.options[0]).not.toHaveProperty("isCorrect");
  });
});
