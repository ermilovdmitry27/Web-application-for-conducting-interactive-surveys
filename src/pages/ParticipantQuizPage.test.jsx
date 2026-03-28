import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ParticipantQuizPage from "./ParticipantQuizPage";

jest.mock("../css/CabinetPage.module.css", () => new Proxy({}, { get: (_target, prop) => prop }));

jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});

const mockRequestWithAuth = jest.fn();

jest.mock("../lib/api/requestWithAuth", () => ({
  requestWithAuth: (...args) => mockRequestWithAuth(...args),
}));

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
  resolveApiAssetUrl: (path) => `http://api.test${path}`,
}));

jest.mock("../lib/websocket", () => ({
  buildWebSocketUrl: () => "ws://socket.test/ws",
  parseWebSocketMessage: (raw) => JSON.parse(String(raw)),
}));

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

function renderParticipantQuizPage(route = "/participant/quiz/room77") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/participant/quiz/:joinCode" element={<ParticipantQuizPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ParticipantQuizPage smoke", () => {
  const originalWebSocket = window.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockRequestWithAuth.mockReset();
    localStorage.clear();
    localStorage.setItem("auth_token", "participant-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 7,
        role: "participant",
        name: "Alice Example",
        firstName: "Alice",
        lastName: "Example",
        email: "alice@example.com",
      })
    );
    global.WebSocket = MockWebSocket;
    window.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    window.WebSocket = originalWebSocket;
  });

  it("joins a live room, opens websocket auth, and renders the lobby state", async () => {
    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/live/join" && options.method === "POST") {
        return Promise.resolve({
          attemptsUsed: 1,
          attemptsLimit: 3,
          attemptsRemaining: 2,
          session: {
            sessionId: 77,
            quizTitle: "Smoke Live Quiz",
            joinCode: "ROOM77",
            status: "running",
            isLiveStarted: false,
            isPaused: false,
            participantsCount: 2,
            questionCount: 4,
            currentQuestionIndex: -1,
            rules: {
              allowBackNavigation: false,
            },
          },
        });
      }

      if (url === "http://api.test/api/live-sessions/77/state" && options.method === "GET") {
        return Promise.resolve({
          session: {
            sessionId: 77,
            quizTitle: "Smoke Live Quiz",
            joinCode: "ROOM77",
            status: "running",
            isLiveStarted: false,
            isPaused: false,
            participantsCount: 2,
            questionCount: 4,
            currentQuestionIndex: -1,
            rules: {
              allowBackNavigation: false,
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    renderParticipantQuizPage();

    expect(await screen.findByText("Smoke Live Quiz")).toBeInTheDocument();
    expect(screen.getByText("Комната открыта, эфир еще не начался.")).toBeInTheDocument();
    expect(screen.getByText("ROOM77")).toBeInTheDocument();

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
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/live-sessions/77/state",
        expect.objectContaining({ method: "GET" })
      );
    });

    expect(socket.sentMessages).toContain(
      JSON.stringify({
        type: "auth",
        token: "participant-token",
      })
    );
    expect(socket.sentMessages).toContain(
      JSON.stringify({
        type: "live:join",
        sessionId: 77,
      })
    );
  });

  it("shows the join error when the live room cannot be opened", async () => {
    mockRequestWithAuth.mockRejectedValue(new Error("Комната не найдена."));

    renderParticipantQuizPage();

    expect(await screen.findByText("Комната не найдена.")).toBeInTheDocument();
  });
});
