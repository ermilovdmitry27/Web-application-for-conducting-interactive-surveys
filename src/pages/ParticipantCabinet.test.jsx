import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ParticipantCabinet from "./ParticipantCabinet";

const mockNavigate = jest.fn();
const mockRequestWithAuth = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});

jest.mock("../lib/api/requestWithAuth", () => ({
  requestWithAuth: (...args) => mockRequestWithAuth(...args),
}));

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

describe("ParticipantCabinet smoke", () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockRequestWithAuth.mockReset();
    localStorage.clear();
    localStorage.setItem("auth_token", "participant-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 7,
        role: "participant",
        firstName: "Алиса",
        lastName: "Соколова",
        email: "alice@example.com",
      })
    );
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("joins a live quiz from the cabinet and lazy-loads the leaderboard for a live attempt", async () => {
    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/attempts/mine" && options.method === "GET") {
        return Promise.resolve({
          attempts: [
            {
              id: 101,
              quizId: 12,
              quizTitle: "History Sprint",
              createdAt: "2026-03-28T12:00:00.000Z",
              score: 8,
              maxScore: 10,
              percentage: 80,
              timeSpentSeconds: 95,
              answeredQuestionsCount: 8,
              isLive: true,
              liveSessionId: 77,
              answers: [
                {
                  questionPosition: 1,
                  prompt: "Когда началась перестройка?",
                  optionTexts: ["1985"],
                  isCorrect: true,
                  submittedAfterSeconds: 3,
                },
              ],
            },
          ],
        });
      }

      if (
        url === "http://api.test/api/live-sessions/77/leaderboard" &&
        options.method === "GET"
      ) {
        return Promise.resolve({
          leaderboard: {
            entries: [
              {
                participantId: 7,
                participantName: "Алиса Соколова",
                score: 8,
                maxScore: 10,
                percentage: 80,
                place: 1,
              },
              {
                participantId: 9,
                participantName: "Борис",
                score: 7,
                maxScore: 10,
                percentage: 70,
                place: 2,
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<ParticipantCabinet />);

    expect(
      await screen.findByText(/Алиса, подключайтесь к live-квизам и сохраняйте каждую попытку/)
    ).toBeInTheDocument();
    expect(await screen.findByText("History Sprint")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Код комнаты"), {
      target: { value: " ab12cd " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Открыть live-квиз" }));
    expect(mockNavigate).toHaveBeenCalledWith("/participant/quiz/AB12CD");

    fireEvent.click(screen.getByRole("button", { name: "Развернуть группу" }));
    fireEvent.click(await screen.findByRole("button", { name: "Подробнее" }));

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/live-sessions/77/leaderboard",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    expect(await screen.findByText("Итоговый лидерборд live-сессии")).toBeInTheDocument();
    expect(screen.getByText("Ваше место: #1")).toBeInTheDocument();
    expect(screen.getByText(/#1 Алиса Соколова/)).toBeInTheDocument();
  });

  it("shows join validation and deletes an attempt group after confirmation", async () => {
    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/attempts/mine" && options.method === "GET") {
        return Promise.resolve({
          attempts: [
            {
              id: 202,
              quizId: 42,
              quizTitle: "Science Finals",
              createdAt: "2026-03-27T15:30:00.000Z",
              score: 6,
              maxScore: 10,
              percentage: 60,
              timeSpentSeconds: 110,
              answeredQuestionsCount: 6,
              isLive: true,
              liveSessionId: 88,
              answers: [],
            },
          ],
        });
      }

      if (url === "http://api.test/api/attempts/mine/42" && options.method === "DELETE") {
        return Promise.resolve({});
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<ParticipantCabinet />);

    expect(await screen.findByText("Science Finals")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть live-квиз" }));
    expect(await screen.findByText("Введите код комнаты.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Удалить попытки" }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Удалить все ваши попытки по квизу "Science Finals"? Это действие нельзя отменить.'
      );
    });

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/attempts/mine/42",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("Science Finals")).not.toBeInTheDocument();
    });
  });

  it("ignores non-live attempts and does not render the classic attempts block", async () => {
    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/attempts/mine" && options.method === "GET") {
        return Promise.resolve({
          attempts: [
            {
              id: 303,
              quizId: 50,
              quizTitle: "Dev Demo Quiz",
              createdAt: "2026-03-28T10:00:00.000Z",
              score: 10,
              maxScore: 10,
              percentage: 100,
              timeSpentSeconds: 45,
              answeredQuestionsCount: 10,
              isLive: false,
              answers: [],
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<ParticipantCabinet />);

    expect(await screen.findByText("История пока пустая.")).toBeInTheDocument();
    expect(screen.queryByText("Самостоятельные попытки")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev Demo Quiz")).not.toBeInTheDocument();
  });
});
