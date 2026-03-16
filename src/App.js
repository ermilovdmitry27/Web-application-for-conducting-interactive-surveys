import { Link, Navigate, Route, Routes } from "react-router-dom";
import styles from "./App.module.css";
import HomePage from "./pages/HomePage";
import RegistrationPage from "./pages/RegistrationPage";
import LoginPage from "./pages/LoginPage";
import ParticipantCabinet from "./pages/ParticipantCabinet";
import ParticipantQuizPage from "./pages/ParticipantQuizPage";
import OrganizerCabinet from "./pages/OrganizerCabinet";
import OrganizerLivePage from "./pages/OrganizerLivePage";
import CreateQuizPage from "./pages/CreateQuizPage";
import ProfilePage from "./pages/ProfilePage";

function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function PrivateRoute({ children, allowedRole }) {
  const token = localStorage.getItem("auth_token");
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }
  return children;
}


function NotFoundPage() {
  return (
    <main className={styles.notFoundPage}>
      <section className={styles.notFoundCard}>
        <p className={styles.notFoundEyebrow}>Navigation</p>
        <h1 className={styles.notFoundTitle}>Страница не найдена.</h1>
        <p className={styles.notFoundText}>
          Похоже, ссылка устарела или адрес был введен с ошибкой. Вернитесь на главную и продолжите работу из нужного кабинета.
        </p>
        <Link to="/" className={styles.notFoundLink}>
          На главную
        </Link>
      </section>
    </main>
  );
}

function App() {
  return (
    <div className={styles.app}>
     

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/registration" element={<RegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/participant"
          element={
            <PrivateRoute allowedRole="participant">
              <ParticipantCabinet />
            </PrivateRoute>
          }
        />
        <Route
          path="/participant/quiz/:joinCode"
          element={
            <PrivateRoute allowedRole="participant">
              <ParticipantQuizPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/organizer"
          element={
            <PrivateRoute allowedRole="organizer">
              <OrganizerCabinet />
            </PrivateRoute>
          }
        />
        <Route
          path="/organizer/quizzes/new"
          element={
            <PrivateRoute allowedRole="organizer">
              <CreateQuizPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/organizer/quizzes/:quizId/edit"
          element={
            <PrivateRoute allowedRole="organizer">
              <CreateQuizPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/organizer/live/:quizId"
          element={
            <PrivateRoute allowedRole="organizer">
              <OrganizerLivePage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
