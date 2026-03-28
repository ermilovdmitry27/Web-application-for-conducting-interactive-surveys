import { act, render, screen, waitFor } from "@testing-library/react";
import OrganizerLivePage from "./OrganizerLivePage";

jest.mock("../css/CabinetPage.module.css", () => new Proxy({}, { get: (_target, prop) => prop }));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ quizId: "1" }),
}), { virtual: true });

jest.mock("../components/AsyncStateNotice", () => function AsyncStateNotice({ message }) {
  return <div>{message}</div>;
});
jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});
jest.mock("./organizer-live/LiveHeroSection", () => function LiveHeroSection(props) {
  return (
    <div>
      <span>participants:{props.participantsCount}</span>
      <span>ws:{props.wsStatus}</span>
    </div>
  );
});
jest.mock("./organizer-live/LiveLobbyPanel", () => function LiveLobbyPanel() {
  return <div>lobby</div>;
});
jest.mock("./organizer-live/ActiveQuestionPanel", () => function ActiveQuestionPanel(props) {
  return <div>active-question answers:{props.currentQuestionAnswersCount}</div>;
});
jest.mock("./organizer-live/FinishedLeaderboardPanel", () => function FinishedLeaderboardPanel() {
  return <div>finished</div>;
});

const mockRequestWithAuth = jest.fn();

jest.mock("../lib/api/requestWithAuth", () => ({
  requestWithAuth: (...args) => mockRequestWithAuth(...args),
}));

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

jest.mock("../lib/websocket", () => ({
  buildWebSocketUrl: () => "ws://socket.test/ws",
  parseWebSocketMessage: (raw) => JSON.parse(String(raw)),
}));

jest.mock("./organizer-live/utils", () => ({
  getLiveStatusLabel: () => "running",
  getStoredUser: () => ({
    id: 15,
    role: "organizer",
    name: "Organizer",
    firstName: "Organizer",
    avatarDataUrl: "",
  }),
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class MockWebSocket {
  static instances = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sentMessages = [];
    MockWebSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  send(payload) {
    this.sentMessages.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  emit(type, payload) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach((handler) => handler(payload));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }
}

describe("OrganizerLivePage burst handling", () => {
  const originalWebSocket = window.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockRequestWithAuth.mockReset();
    localStorage.clear();
    localStorage.setItem("auth_token", "token");
    global.WebSocket = MockWebSocket;
    window.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    window.WebSocket = originalWebSocket;
  });

  it("applies answer bursts locally without extra /state refresh when organizer already knows participants", async () => {
    const firstStateRequest = createDeferred();
    let stateRequestCount = 0;

    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/quizzes/1/live/start" && options.method === "POST") {
        return Promise.resolve({
          session: {
            sessionId: 77,
            quizId: 1,
            quizTitle: "Quiz",
            joinCode: "ROOM77",
            status: "running",
            isLiveStarted: true,
            isPaused: false,
            participantsCount: 1,
            questionCount: 3,
            currentQuestionIndex: 0,
            currentQuestion: {
              index: 0,
              prompt: "Question",
              options: [],
            },
            questionTimeLimitSeconds: 30,
            questionRemainingSeconds: 25,
            participants: [
              {
                participantId: 1,
                participantName: "Alice",
                participantAvatarDataUrl: "",
                joinedAt: "2026-03-24T10:00:00.000Z",
              },
            ],
            currentQuestionAnswersCount: 0,
            currentQuestionAnsweredParticipants: [],
          },
        });
      }

      if (url === "http://api.test/api/live-sessions/77/state" && options.method === "GET") {
        stateRequestCount += 1;
        return firstStateRequest.promise;
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<OrganizerLivePage />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.open();
      socket.emit("message", {
        data: JSON.stringify({
          type: "ws:auth-ok",
        }),
      });
    });

    await waitFor(() => {
      expect(stateRequestCount).toBe(1);
    });

    act(() => {
      for (let index = 0; index < 5; index += 1) {
        socket.emit("message", {
          data: JSON.stringify({
            type: "live:answer-received",
            sessionId: 77,
            participantId: index + 1,
            questionIndex: 0,
          }),
        });
      }
    });

    expect(stateRequestCount).toBe(1);

    await act(async () => {
      firstStateRequest.resolve({
        session: {
          sessionId: 77,
          quizId: 1,
          quizTitle: "Quiz",
          joinCode: "ROOM77",
          status: "running",
          isLiveStarted: true,
          isPaused: false,
          participantsCount: 1,
          questionCount: 3,
          currentQuestionIndex: 0,
          currentQuestion: {
            index: 0,
            prompt: "Question",
            options: [],
          },
          questionTimeLimitSeconds: 30,
          questionRemainingSeconds: 25,
          participants: [
            {
              participantId: 1,
              participantName: "Alice",
              participantAvatarDataUrl: "",
              joinedAt: "2026-03-24T10:00:00.000Z",
            },
          ],
          currentQuestionAnswersCount: 0,
          currentQuestionAnsweredParticipants: [],
        },
      });
      await Promise.resolve();
    });

    act(() => {
      for (let index = 0; index < 5; index += 1) {
        socket.emit("message", {
          data: JSON.stringify({
            type: "live:answer-received",
            sessionId: 77,
            participantId: 1,
            questionIndex: 0,
            submittedAt: `2026-03-24T10:00:0${index + 1}.000Z`,
            submittedAfterSeconds: 3 + index,
          }),
        });
      }
    });

    expect(stateRequestCount).toBe(1);
    expect(await screen.findByText("participants:1")).toBeInTheDocument();
    expect(screen.getByText("active-question answers:1")).toBeInTheDocument();
  });

  it("preserves organizer-only answered data on pause ws event", async () => {
    const firstStateRequest = createDeferred();
    let stateRequestCount = 0;

    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/quizzes/1/live/start" && options.method === "POST") {
        return Promise.resolve({
          session: {
            sessionId: 77,
            quizId: 1,
            quizTitle: "Quiz",
            joinCode: "ROOM77",
            status: "running",
            isLiveStarted: true,
            isPaused: false,
            participantsCount: 1,
            questionCount: 3,
            currentQuestionIndex: 0,
            currentQuestion: {
              index: 0,
              prompt: "Question",
              options: [],
            },
            questionTimeLimitSeconds: 30,
            questionRemainingSeconds: 25,
            participants: [
              {
                participantId: 1,
                participantName: "Alice",
                participantAvatarDataUrl: "",
                joinedAt: "2026-03-24T10:00:00.000Z",
              },
            ],
            currentQuestionAnswersCount: 1,
            currentQuestionAnsweredParticipants: [
              {
                participantId: 1,
                participantName: "Alice",
                participantAvatarDataUrl: "",
                submittedAt: "2026-03-24T10:00:05.000Z",
                submittedAfterSeconds: 5,
              },
            ],
          },
        });
      }

      if (url === "http://api.test/api/live-sessions/77/state" && options.method === "GET") {
        stateRequestCount += 1;
        return firstStateRequest.promise;
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<OrganizerLivePage />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.open();
      socket.emit("message", {
        data: JSON.stringify({
          type: "ws:auth-ok",
        }),
      });
    });

    await waitFor(() => {
      expect(stateRequestCount).toBe(1);
    });

    await act(async () => {
      firstStateRequest.resolve({
        session: {
          sessionId: 77,
          quizId: 1,
          quizTitle: "Quiz",
          joinCode: "ROOM77",
          status: "running",
          isLiveStarted: true,
          isPaused: false,
          participantsCount: 1,
          questionCount: 3,
          currentQuestionIndex: 0,
          currentQuestion: {
            index: 0,
            prompt: "Question",
            options: [],
          },
          questionTimeLimitSeconds: 30,
          questionRemainingSeconds: 25,
          participants: [
            {
              participantId: 1,
              participantName: "Alice",
              participantAvatarDataUrl: "",
              joinedAt: "2026-03-24T10:00:00.000Z",
            },
          ],
          currentQuestionAnswersCount: 1,
          currentQuestionAnsweredParticipants: [
            {
              participantId: 1,
              participantName: "Alice",
              participantAvatarDataUrl: "",
              submittedAt: "2026-03-24T10:00:05.000Z",
              submittedAfterSeconds: 5,
            },
          ],
        },
      });
      await Promise.resolve();
    });

    act(() => {
      socket.emit("message", {
        data: JSON.stringify({
          type: "live:session-paused",
          session: {
            sessionId: 77,
            quizId: 1,
            quizTitle: "Quiz",
            joinCode: "ROOM77",
            status: "running",
            isLiveStarted: true,
            isPaused: true,
            participantsCount: 1,
            questionCount: 3,
            currentQuestionIndex: 0,
            currentQuestion: {
              index: 0,
              prompt: "Question",
              options: [],
            },
            questionTimeLimitSeconds: 30,
            questionRemainingSeconds: 20,
            participants: [],
            currentQuestionAnswersCount: 0,
            currentQuestionAnsweredParticipants: [],
          },
        }),
      });
    });

    expect(screen.getByText("participants:1")).toBeInTheDocument();
    expect(screen.getByText("active-question answers:1")).toBeInTheDocument();
    expect(stateRequestCount).toBe(1);
  });
});
