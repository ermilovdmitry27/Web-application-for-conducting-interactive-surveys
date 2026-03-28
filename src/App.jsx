import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import styles from "./App.module.css";
import HomePage from "./pages/HomePage";

const RegistrationPage = lazy(() => import("./pages/RegistrationPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ParticipantCabinet = lazy(() => import("./pages/ParticipantCabinet"));
const ParticipantQuizPage = lazy(() => import("./pages/ParticipantQuizPage"));
const OrganizerCabinet = lazy(() => import("./pages/OrganizerCabinet"));
const OrganizerLivePage = lazy(() => import("./pages/OrganizerLivePage"));
const CreateQuizPage = lazy(() => import("./pages/CreateQuizPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

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

function RouteFallback() {
  return (
    <main className={styles.routeFallback}>
      <section className={styles.routeFallbackCard}>
        <p className={styles.routeFallbackLabel}>Loading</p>
        <h1 className={styles.routeFallbackTitle}>Загружаем экран...</h1>
        <p className={styles.routeFallbackText}>
          Подготавливаем страницу и связанные модули интерфейса.
        </p>
      </section>
    </main>
  );
}

function App() {
  return (
    <div className={styles.app}>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
    </div>
  );
}

export default App;
