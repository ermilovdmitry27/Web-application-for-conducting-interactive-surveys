import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrganizerCabinet from "./OrganizerCabinet";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});

jest.mock("../components/EditIcon", () => function EditIcon() {
  return <span>edit-icon</span>;
});

jest.mock("../components/LiveIcon", () => function LiveIcon() {
  return <span>live-icon</span>;
});

jest.mock("../components/PlusIcon", () => function PlusIcon() {
  return <span>plus-icon</span>;
});

jest.mock("../components/TrashIcon", () => function TrashIcon() {
  return <span>trash-icon</span>;
});

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  });
}

describe("OrganizerCabinet smoke", () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockNavigate.mockReset();
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
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it("loads the organizer dashboard and navigates through primary quiz actions", async () => {
    global.fetch = jest.fn((url) => {
      if (url === "http://api.test/api/quizzes/mine") {
        return jsonResponse({
          quizzes: [
            {
              id: 1,
              title: "History Sprint",
              joinCode: "ABCD12",
              category: "history",
              questionCount: 10,
              durationMinutes: 15,
              questionTimeSeconds: 20,
              maxAttemptsPerParticipant: 2,
              isActive: true,
            },
            {
              id: 2,
              title: "Science Finals",
              joinCode: "ZXCV98",
              category: "science",
              questionCount: 8,
              durationMinutes: 12,
              questionTimeSeconds: 15,
              maxAttemptsPerParticipant: 1,
              isActive: false,
            },
          ],
        });
      }

      if (url === "http://api.test/api/quizzes/mine/attempts?limit=150") {
        return jsonResponse({ attempts: [] });
      }

      if (url === "http://api.test/api/live-sessions/mine?limit=20") {
        return jsonResponse({ sessions: [] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<OrganizerCabinet />);

    expect(
      await screen.findByText(/Анна, управляйте квизами, live-комнатами и аналитикой/)
    ).toBeInTheDocument();
    expect(await screen.findByText("History Sprint")).toBeInTheDocument();
    expect(screen.queryByText("Science Finals")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Показать все квизы (2)" }));
    expect(await screen.findByText("Science Finals")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Создать квиз" }));
    expect(mockNavigate).toHaveBeenCalledWith("/organizer/quizzes/new");

    fireEvent.click(screen.getAllByRole("button", { name: "Редактировать квиз" })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/organizer/quizzes/1/edit");

    fireEvent.click(screen.getAllByRole("button", { name: "Запустить live" })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/organizer/live/1");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/quizzes/mine",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer organizer-token",
        }),
      })
    );
  });

  it("deletes a quiz after confirmation and removes it from the visible list", async () => {
    global.fetch = jest.fn((url, options = {}) => {
      if (url === "http://api.test/api/quizzes/mine" && options.method === "GET") {
        return jsonResponse({
          quizzes: [
            {
              id: 1,
              title: "History Sprint",
              joinCode: "ABCD12",
              category: "history",
              questionCount: 10,
              durationMinutes: 15,
              questionTimeSeconds: 20,
              maxAttemptsPerParticipant: 2,
              isActive: true,
            },
          ],
        });
      }

      if (url === "http://api.test/api/quizzes/mine/attempts?limit=150" && options.method === "GET") {
        return jsonResponse({ attempts: [] });
      }

      if (url === "http://api.test/api/live-sessions/mine?limit=20" && options.method === "GET") {
        return jsonResponse({ sessions: [] });
      }

      if (url === "http://api.test/api/quizzes/1" && options.method === "DELETE") {
        return jsonResponse({});
      }

      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });

    render(<OrganizerCabinet />);

    await screen.findByText("History Sprint");
    fireEvent.click(screen.getByRole("button", { name: "Удалить квиз" }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Удалить квиз "History Sprint"? Это действие нельзя отменить.'
      );
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://api.test/api/quizzes/1",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer organizer-token",
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("History Sprint")).not.toBeInTheDocument();
    });
  });
});
