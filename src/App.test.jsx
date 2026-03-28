import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";

jest.mock("./App.module.css", () => new Proxy({}, { get: (_target, prop) => prop }));

jest.mock("./pages/HomePage", () => ({
  __esModule: true,
  default: function HomePage() {
    return <div>HomePage</div>;
  },
}));

jest.mock("./pages/RegistrationPage", () => ({
  __esModule: true,
  default: function RegistrationPage() {
    return <div>RegistrationPage</div>;
  },
}));

jest.mock("./pages/LoginPage", () => ({
  __esModule: true,
  default: function LoginPage() {
    return <div>LoginPage</div>;
  },
}));

jest.mock("./pages/ParticipantCabinet", () => ({
  __esModule: true,
  default: function ParticipantCabinet() {
    return <div>ParticipantCabinet</div>;
  },
}));

jest.mock("./pages/ParticipantQuizPage", () => ({
  __esModule: true,
  default: function ParticipantQuizPage() {
    return <div>ParticipantQuizPage</div>;
  },
}));

jest.mock("./pages/OrganizerCabinet", () => ({
  __esModule: true,
  default: function OrganizerCabinet() {
    return <div>OrganizerCabinet</div>;
  },
}));

jest.mock("./pages/OrganizerLivePage", () => ({
  __esModule: true,
  default: function OrganizerLivePage() {
    return <div>OrganizerLivePage</div>;
  },
}));

jest.mock("./pages/CreateQuizPage", () => ({
  __esModule: true,
  default: function CreateQuizPage() {
    return <div>CreateQuizPage</div>;
  },
}));

jest.mock("./pages/ProfilePage", () => ({
  __esModule: true,
  default: function ProfilePage() {
    return <div>ProfilePage</div>;
  },
}));

function renderApp(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe("App route smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects unauthenticated users from protected routes to login", async () => {
    renderApp("/profile");

    expect(await screen.findByText("LoginPage")).toBeInTheDocument();
  });

  it("opens organizer routes for authenticated organizers", async () => {
    localStorage.setItem("auth_token", "organizer-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 1,
        role: "organizer",
      })
    );

    renderApp("/organizer");

    expect(await screen.findByText("OrganizerCabinet")).toBeInTheDocument();
  });

  it("redirects participants away from organizer routes", async () => {
    localStorage.setItem("auth_token", "participant-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 2,
        role: "participant",
      })
    );

    renderApp("/organizer");

    expect(await screen.findByText("HomePage")).toBeInTheDocument();
  });

  it("renders the participant live route for authenticated participants", async () => {
    localStorage.setItem("auth_token", "participant-token");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: 2,
        role: "participant",
      })
    );

    renderApp("/participant/quiz/room77");

    expect(await screen.findByText("ParticipantQuizPage")).toBeInTheDocument();
  });

  it("shows the not found page for unknown routes", () => {
    renderApp("/missing-route");

    expect(screen.getByText("Страница не найдена.")).toBeInTheDocument();
  });
});
