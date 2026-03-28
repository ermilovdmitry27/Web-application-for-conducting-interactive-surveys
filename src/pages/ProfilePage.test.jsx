import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfilePage from "./ProfilePage";

const mockNavigate = jest.fn();
const mockRequestWithAuth = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("../components/CabinetTopMenu", () => function CabinetTopMenu() {
  return <div>top-menu</div>;
});

jest.mock("../lib/api/config", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

jest.mock("../lib/api/requestWithAuth", () => ({
  requestWithAuth: (...args) => mockRequestWithAuth(...args),
}));

describe("ProfilePage smoke", () => {
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockRequestWithAuth.mockReset();
    localStorage.clear();
    localStorage.setItem("auth_token", "organizer-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 10,
        role: "organizer",
        firstName: "Анна",
        lastName: "Иванова",
        middleName: "Сергеевна",
        email: "anna@example.com",
        avatarDataUrl: "",
      })
    );
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  it("saves the profile form and syncs normalized data to localStorage", async () => {
    mockRequestWithAuth.mockResolvedValue({
      user: {
        id: 10,
        role: "organizer",
        firstName: "Мария",
        lastName: "Петрова",
        middleName: "Ивановна",
        email: "maria@example.com",
      },
    });

    render(<ProfilePage />);

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "  Петрова  " },
    });
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "  Мария " },
    });
    fireEvent.change(screen.getByLabelText("Отчество"), {
      target: { value: " Ивановна " },
    });
    fireEvent.change(screen.getByLabelText("Логин"), {
      target: { value: "  MARIA@EXAMPLE.COM " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/users/me/profile",
        expect.objectContaining({
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: "Мария",
            lastName: "Петрова",
            middleName: "Ивановна",
            email: "maria@example.com",
          }),
        })
      );
    });

    expect(await screen.findByText("Профиль сохранен.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("auth_user"))).toMatchObject({
      firstName: "Мария",
      lastName: "Петрова",
      middleName: "Ивановна",
      email: "maria@example.com",
    });
  });

  it("uploads an avatar image and stores the updated avatar in localStorage", async () => {
    class MockFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.result = "";
      }

      readAsDataURL() {
        this.result = "data:image/png;base64,avatar-data";
        if (typeof this.onload === "function") {
          this.onload();
        }
      }
    }

    global.FileReader = MockFileReader;

    mockRequestWithAuth.mockResolvedValue({
      user: {
        id: 10,
        role: "organizer",
        firstName: "Анна",
        lastName: "Иванова",
        middleName: "Сергеевна",
        email: "anna@example.com",
        avatarDataUrl: "data:image/png;base64,server-avatar",
      },
    });

    render(<ProfilePage />);
    const fileInput = screen.getByLabelText("Выбрать фото профиля");
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(mockRequestWithAuth).toHaveBeenCalledWith(
        "http://api.test/api/users/me/avatar",
        expect.objectContaining({
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            avatarDataUrl: "data:image/png;base64,avatar-data",
          }),
        })
      );
    });

    expect(await screen.findByText("Фото профиля обновлено.")).toBeInTheDocument();
    expect(screen.getByAltText("Аватар профиля")).toHaveAttribute(
      "src",
      "data:image/png;base64,server-avatar"
    );
    expect(JSON.parse(localStorage.getItem("auth_user"))).toMatchObject({
      avatarDataUrl: "data:image/png;base64,server-avatar",
    });
  });
});
