import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreateQuizPage from "./CreateQuizPage";

const mockNavigate = jest.fn();
const mockRequestWithAuth = jest.fn();
let mockParams = {};

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}), { virtual: true });

jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});

jest.mock("../lib/api/requestWithAuth", () => ({
  requestWithAuth: (...args) => mockRequestWithAuth(...args),
}));

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
  resolveApiAssetUrl: (path) => `http://api.test${path}`,
}));

describe("CreateQuizPage smoke", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockRequestWithAuth.mockReset();
    mockParams = {};
    global.fetch = originalFetch;
    localStorage.clear();
    localStorage.setItem("auth_token", "organizer-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 1,
        role: "organizer",
        firstName: "Анна",
        lastName: "Иванова",
        email: "anna@example.com",
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("creates a quiz with a reduced single-question form", async () => {
    mockRequestWithAuth.mockResolvedValue({ quiz: { id: 11 } });

    render(<CreateQuizPage />);

    fireEvent.change(screen.getByLabelText("Название квиза"), {
      target: { value: "  Исторический блиц  " },
    });
    fireEvent.change(screen.getByLabelText("Количество вопросов"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Введите вопрос"), {
      target: { value: "Когда началась перестройка?" },
    });
    fireEvent.change(screen.getByPlaceholderText("Вариант 1"), {
      target: { value: "1985" },
    });
    fireEvent.change(screen.getByPlaceholderText("Вариант 2"), {
      target: { value: "1991" },
    });
    fireEvent.click(screen.getAllByLabelText("Верный")[0]);

    fireEvent.click(screen.getByRole("button", { name: "Создать квиз" }));

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/quizzes",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    const [, request] = mockRequestWithAuth.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload).toMatchObject({
      title: "Исторический блиц",
      description: "",
      category: "history",
      isActive: true,
      durationMinutes: 15,
      questionTimeSeconds: 30,
      maxAttempts: 1,
      rules: {
        allowBackNavigation: false,
        showCorrectAfterAnswer: false,
        shuffleQuestions: false,
      },
    });
    expect(payload.questions).toEqual([
      {
        type: "text",
        prompt: "Когда началась перестройка?",
        imageUrl: "",
        answerMode: "single",
        options: [
          { text: "1985", isCorrect: true },
          { text: "1991", isCorrect: false },
        ],
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith("/organizer", { replace: true });
  });

  it("loads an existing quiz in edit mode and saves updated data", async () => {
    mockParams = { quizId: "42" };

    mockRequestWithAuth.mockImplementation((url, options = {}) => {
      if (url === "http://api.test/api/quizzes/42" && options.method === "GET") {
        return Promise.resolve({
          quiz: {
            id: 42,
            title: "Старый квиз",
            description: "Описание",
            category: "science",
            isActive: false,
            durationMinutes: 20,
            questionTimeSeconds: 45,
            maxAttemptsPerParticipant: 2,
            rules: {
              allowBackNavigation: true,
              showCorrectAfterAnswer: true,
              shuffleQuestions: false,
            },
            questions: [
              {
                type: "text",
                prompt: "Сколько планет в Солнечной системе?",
                answerMode: "single",
                options: [
                  { text: "8", isCorrect: true },
                  { text: "9", isCorrect: false },
                ],
              },
            ],
          },
        });
      }

      if (url === "http://api.test/api/quizzes/42" && options.method === "PUT") {
        return Promise.resolve({ quiz: { id: 42 } });
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<CreateQuizPage />);

    expect(await screen.findByText("Редактирование квиза")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Старый квиз")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Сколько планет в Солнечной системе?")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Название квиза"), {
      target: { value: "Обновленный квиз" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/quizzes/42",
        expect.objectContaining({
          method: "PUT",
        })
      );
    });

    const putRequest = mockRequestWithAuth.mock.calls.find(
      ([url, options]) => url === "http://api.test/api/quizzes/42" && options?.method === "PUT"
    );
    const payload = JSON.parse(putRequest[1].body);

    expect(payload).toMatchObject({
      title: "Обновленный квиз",
      category: "science",
      isActive: false,
      durationMinutes: 20,
      questionTimeSeconds: 45,
      maxAttempts: 2,
      rules: {
        allowBackNavigation: true,
        showCorrectAfterAnswer: true,
        shuffleQuestions: false,
      },
    });
    expect(payload.questions).toHaveLength(1);
    expect(mockNavigate).toHaveBeenCalledWith("/organizer", { replace: true });
  });

  it("uploads an image question and includes the uploaded image in the create payload", async () => {
    global.fetch = jest.fn((url, options = {}) => {
      if (url === "http://api.test/api/uploads/question-image" && options.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              imageUrl: "/uploads/questions/history-1.png",
            }),
        });
      }

      throw new Error(`Unexpected upload request: ${options.method || "GET"} ${url}`);
    });

    mockRequestWithAuth.mockResolvedValue({ quiz: { id: 21 } });

    render(<CreateQuizPage />);

    fireEvent.change(screen.getByLabelText("Название квиза"), {
      target: { value: "Квиз с изображением" },
    });
    fireEvent.change(screen.getByLabelText("Количество вопросов"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Тип вопроса 1"), {
      target: { value: "image" },
    });
    fireEvent.change(screen.getByPlaceholderText("Введите вопрос"), {
      target: { value: "Что изображено на фото?" },
    });
    fireEvent.change(screen.getByPlaceholderText("Вариант 1"), {
      target: { value: "Ответ A" },
    });
    fireEvent.change(screen.getByPlaceholderText("Вариант 2"), {
      target: { value: "Ответ B" },
    });
    fireEvent.click(screen.getAllByLabelText("Верный")[0]);

    const fileInput = screen.getByLabelText("Загрузить изображение вопроса 1");
    const file = new File(["image"], "question.png", { type: "image/png" });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://api.test/api/uploads/question-image",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer organizer-token",
          },
          body: expect.any(FormData),
        })
      );
    });

    expect(await screen.findByAltText("Иллюстрация для вопроса 1")).toHaveAttribute(
      "src",
      "http://api.test/uploads/questions/history-1.png"
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать квиз" }));

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/quizzes",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    const [, request] = mockRequestWithAuth.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload.questions).toEqual([
      {
        type: "image",
        prompt: "Что изображено на фото?",
        imageUrl: "/uploads/questions/history-1.png",
        answerMode: "single",
        options: [
          { text: "Ответ A", isCorrect: true },
          { text: "Ответ B", isCorrect: false },
        ],
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith("/organizer", { replace: true });
  });
});
