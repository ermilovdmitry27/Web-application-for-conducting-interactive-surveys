const {
  createLiveQuestionOrder,
  getLiveQuestionTimeLimitSeconds,
  getLiveQuestionRemainingSeconds,
  buildLiveStatePair,
} = require("./helpers");
const { getLiveRuntimeData } = require("./runtime");
const {
  getLiveRuntimeContextById,
} = require("./context");
const { getLiveLeaderboard } = require("./leaderboard");
const {
  getFinishedLiveSessionResultsSnapshot,
  saveFinishedLiveSessionResults,
} = require("./results");

function createLiveTransitionHelpers({ pool, broadcastToRoom }) {
  async function startLiveSessionAndGetPayload(sessionId) {
    const context = await getLiveRuntimeContextById(sessionId);
    if (!context) {
      return null;
    }

    if (context.session.status !== "running") {
      const leaderboard = await getLiveLeaderboard(sessionId);
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        leaderboard,
        wasUpdated: false,
      };
    }

    if (context.session.isLiveStarted) {
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        leaderboard: null,
        wasUpdated: false,
      };
    }

    const questionCount = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
    if (questionCount === 0) {
      return finishLiveSessionAndGetPayload(sessionId);
    }
    const questionOrder = createLiveQuestionOrder(context.quiz);

    const startResult = await pool.query(
      `
      UPDATE quiz_sessions
      SET
        is_live_started = TRUE,
        is_paused = FALSE,
        current_question_index = 0,
        question_order_json = $2::jsonb,
        paused_at = NULL,
        paused_remaining_seconds = 0,
        current_question_started_at = NOW()
      WHERE id = $1 AND status = 'running' AND is_live_started = FALSE
      RETURNING id;
      `,
      [sessionId, JSON.stringify(questionOrder)]
    );
    const wasUpdated = startResult.rows.length > 0;

    const refreshedContext = await getLiveRuntimeContextById(sessionId);
    if (!refreshedContext) {
      return null;
    }
    const runtime = await getLiveRuntimeData(refreshedContext);
    const states = buildLiveStatePair(
      refreshedContext,
      runtime.participants,
      runtime.answeredParticipants
    );

    if (wasUpdated) {
      broadcastToRoom(`live:${sessionId}`, {
        type: "live:session-started",
        session: states.participantState,
      });
    }

    return {
      ...states,
      context: refreshedContext,
      leaderboard: null,
      wasUpdated,
    };
  }

  async function pauseLiveSessionAndGetPayload(sessionId) {
    const context = await getLiveRuntimeContextById(sessionId);
    if (!context) {
      return null;
    }

    if (
      context.session.status !== "running" ||
      !context.session.isLiveStarted ||
      context.session.currentQuestionIndex < 0
    ) {
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        wasUpdated: false,
      };
    }

    if (context.session.isPaused) {
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        wasUpdated: false,
      };
    }

    const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(context.quiz);
    const questionRemainingSeconds = getLiveQuestionRemainingSeconds(
      context.session,
      questionTimeLimitSeconds
    );
    const updateResult = await pool.query(
      `
      UPDATE quiz_sessions
      SET
        is_paused = TRUE,
        paused_at = NOW(),
        paused_remaining_seconds = $2
      WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND is_paused = FALSE
      RETURNING id;
      `,
      [sessionId, questionRemainingSeconds]
    );
    const wasUpdated = updateResult.rows.length > 0;

    const refreshedContext = await getLiveRuntimeContextById(sessionId);
    if (!refreshedContext) {
      return null;
    }

    const runtime = await getLiveRuntimeData(refreshedContext);
    const states = buildLiveStatePair(
      refreshedContext,
      runtime.participants,
      runtime.answeredParticipants
    );

    if (wasUpdated) {
      broadcastToRoom(`live:${sessionId}`, {
        type: "live:session-paused",
        session: states.participantState,
      });
    }

    return {
      ...states,
      context: refreshedContext,
      wasUpdated,
    };
  }

  async function resumeLiveSessionAndGetPayload(sessionId) {
    const context = await getLiveRuntimeContextById(sessionId);
    if (!context) {
      return null;
    }

    if (
      context.session.status !== "running" ||
      !context.session.isLiveStarted ||
      context.session.currentQuestionIndex < 0
    ) {
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        wasUpdated: false,
      };
    }

    if (!context.session.isPaused) {
      const runtime = await getLiveRuntimeData(context);
      const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
      return {
        ...states,
        context,
        wasUpdated: false,
      };
    }

    const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(context.quiz);
    const pausedRemainingSeconds = Math.max(0, Number(context.session.pausedRemainingSeconds || 0));
    const elapsedBeforePause = Math.max(0, questionTimeLimitSeconds - pausedRemainingSeconds);
    const updateResult = await pool.query(
      `
      UPDATE quiz_sessions
      SET
        is_paused = FALSE,
        paused_at = NULL,
        paused_remaining_seconds = 0,
        current_question_started_at = NOW() - ($2 * INTERVAL '1 second')
      WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND is_paused = TRUE
      RETURNING id;
      `,
      [sessionId, elapsedBeforePause]
    );
    const wasUpdated = updateResult.rows.length > 0;

    const refreshedContext = await getLiveRuntimeContextById(sessionId);
    if (!refreshedContext) {
      return null;
    }

    const runtime = await getLiveRuntimeData(refreshedContext);
    const states = buildLiveStatePair(
      refreshedContext,
      runtime.participants,
      runtime.answeredParticipants
    );

    if (wasUpdated) {
      broadcastToRoom(`live:${sessionId}`, {
        type: "live:session-resumed",
        session: states.participantState,
      });
    }

    return {
      ...states,
      context: refreshedContext,
      wasUpdated,
    };
  }

  async function finishLiveSessionAndGetPayload(sessionId) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const finishResult = await client.query(
        `
        UPDATE quiz_sessions
        SET status = 'finished', finished_at = NOW()
        WHERE id = $1 AND status = 'running'
        RETURNING id;
        `,
        [sessionId]
      );
      const wasUpdated = finishResult.rows.length > 0;

      const resultsSnapshot = wasUpdated
        ? await saveFinishedLiveSessionResults(sessionId, { db: client })
        : await getFinishedLiveSessionResultsSnapshot(sessionId, { db: client });
      if (!resultsSnapshot?.context) {
        await client.query("ROLLBACK");
        return null;
      }

      const states = buildLiveStatePair(resultsSnapshot.context, resultsSnapshot.participants, []);
      await client.query("COMMIT");

      if (wasUpdated) {
        broadcastToRoom(`live:${sessionId}`, {
          type: "live:session-finished",
          session: states.participantState,
          leaderboard: resultsSnapshot.leaderboard,
        });
      }

      return {
        ...states,
        context: resultsSnapshot.context,
        leaderboard: resultsSnapshot.leaderboard,
        wasUpdated,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("finishLiveSessionAndGetPayload rollback failed:", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function advanceLiveSessionQuestion(sessionId) {
    const context = await getLiveRuntimeContextById(sessionId);
    if (!context) {
      return null;
    }

    if (context.session.status !== "running") {
      return finishLiveSessionAndGetPayload(sessionId);
    }

    const questionCount = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
    if (questionCount === 0) {
      return finishLiveSessionAndGetPayload(sessionId);
    }

    if (!context.session.isLiveStarted) {
      return startLiveSessionAndGetPayload(sessionId);
    }

    const nextQuestionIndex = context.session.currentQuestionIndex + 1;
    if (nextQuestionIndex >= questionCount) {
      return finishLiveSessionAndGetPayload(sessionId);
    }

    const updateResult = await pool.query(
      `
      UPDATE quiz_sessions
      SET
        is_paused = FALSE,
        paused_at = NULL,
        paused_remaining_seconds = 0,
        current_question_index = $2,
        current_question_started_at = NOW()
      WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND current_question_index = $3
      RETURNING id;
      `,
      [sessionId, nextQuestionIndex, context.session.currentQuestionIndex]
    );

    const refreshedContext = await getLiveRuntimeContextById(sessionId);
    if (!refreshedContext) {
      return null;
    }

    const runtime = await getLiveRuntimeData(refreshedContext);
    const states = buildLiveStatePair(
      refreshedContext,
      runtime.participants,
      runtime.answeredParticipants
    );
    const wasUpdated = updateResult.rows.length > 0;

    if (wasUpdated) {
      broadcastToRoom(`live:${sessionId}`, {
        type: "live:question-changed",
        session: states.participantState,
      });
    }

    return {
      ...states,
      context: refreshedContext,
      leaderboard: null,
      wasUpdated,
    };
  }

  return {
    startLiveSessionAndGetPayload,
    pauseLiveSessionAndGetPayload,
    resumeLiveSessionAndGetPayload,
    finishLiveSessionAndGetPayload,
    advanceLiveSessionQuestion,
  };
}

module.exports = {
  createLiveTransitionHelpers,
};
