import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "../css/LoginPage.module.css";

export default function LoginPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setSubmitError("");

    const form = event.currentTarget;
    const isValid = form.checkValidity();
    if (!isValid) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") || "").trim().toLowerCase(),
      password: String(formData.get("password") || ""),
    };

    try {
      setIsSubmitting(true);
      const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:4000";
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Не удалось выполнить вход.");
      }

      const user = data?.user;
      const token = data?.token;
      if (!token || !user?.role) {
        throw new Error("Сервер вернул неполные данные авторизации.");
      }

      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_user", JSON.stringify(user));

      if (user.role === "organizer") {
        navigate("/organizer", { replace: true });
        return;
      }
      navigate("/participant", { replace: true });
    } catch (error) {
      setSubmitError(error.message || "Ошибка сети. Попробуйте позже.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <aside className={styles.introPanel}>
          <h1 className={styles.heroTitle}>Вход в рабочее пространство квизов.</h1>
          <p className={styles.heroText}>
            Подключайтесь как участник или организатор, чтобы работать с комнатами, live-режимом и результатами.
          </p>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>Live-сессии и комнаты по коду</li>
            <li className={styles.featureItem}>История прохождений и аналитика</li>
            <li className={styles.featureItem}>Минималистичная панель без лишних экранов</li>
          </ul>
          <Link to="/" className={styles.homeLink}>
            На главную
          </Link>
        </aside>

        <form className={`${styles.card} ${submitted ? styles.submitted : ""}`} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <h2 className={styles.title}>Войти</h2>
            <p className={styles.formText}>Используйте e-mail и пароль, которые указали при регистрации.</p>
          </div>

          <label className={styles.fieldGroup}>
            <span className={styles.fieldCaption}>E-mail</span>
            <input
              className={styles.inputField}
              id="e-mail"
              type="email"
              name="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className={styles.fieldGroup}>
            <span className={styles.fieldCaption}>Пароль</span>
            <input
              className={styles.inputField}
              id="password"
              type="password"
              name="password"
              placeholder="Введите пароль"
              required
            />
          </label>

          {submitError && <p className={styles.submitError}>{submitError}</p>}

          <button type="submit" className={styles.authButton} disabled={isSubmitting}>
            {isSubmitting ? "Входим..." : "Войти"}
          </button>

          <div className={styles.textLink}>
            <p className={styles.loginPrompt}>Нет аккаунта?</p>
            <Link to="/registration" className={styles.backLink}>
              Зарегистрироваться
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
