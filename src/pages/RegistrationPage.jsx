import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../css/RegistrationPage.module.css";
import { getApiBaseUrl } from "../lib/api/config";

export default function RegistrationPage() {
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementError, setAgreementError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const apiBaseUrl = getApiBaseUrl();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setSubmitError("");
    setSubmitSuccess("");

    const form = event.currentTarget;
    const isValid = form.checkValidity();
    setAgreementError(!agreementChecked);
    if (!isValid || !agreementChecked) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const middleName = String(formData.get("middleName") || "").trim();
    const payload = {
      name: [lastName, firstName, middleName].filter(Boolean).join(" "),
      firstName,
      lastName,
      middleName,
      email: String(formData.get("email") || "").trim().toLowerCase(),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || ""),
    };

    try {
      setIsSubmitting(true);
      let response;
      try {
        response = await fetch(`${apiBaseUrl}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (_error) {
        throw new Error("Нет связи с API. Проверьте, что backend запущен и приложение открыто по актуальному адресу.");
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Не удалось зарегистрироваться.");
      }

      setSubmitSuccess("Регистрация выполнена успешно. Теперь можно войти.");
      form.reset();
      setAgreementChecked(false);
      setSubmitted(false);
    } catch (error) {
      setSubmitError(error.message || "Ошибка сети. Попробуйте снова.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAgreementChange = (event) => {
    const isChecked = event.target.checked;
    setAgreementChecked(isChecked);
    if (isChecked) {
      setAgreementError(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <aside className={styles.introPanel}>
          <h1 className={styles.heroTitle}>Создайте аккаунт и выберите роль внутри платформы.</h1>
          <p className={styles.heroText}>
            Регистрация открывает доступ к кабинету участника или организатора. Роль можно выбрать сразу перед первым входом.
          </p>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>Организатор создает и ведет квизы</li>
            <li className={styles.featureItem}>Участник подключается по коду комнаты</li>
            <li className={styles.featureItem}>Все результаты сохраняются в истории</li>
          </ul>
          <Link to="/" className={styles.homeLink}>
            На главную
          </Link>
        </aside>

        <form className={`${styles.card} ${submitted ? styles.submitted : ""}`} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <h2 className={styles.title}>Создать аккаунт</h2>
            <p className={styles.formText}>Заполните данные и подтвердите согласие на обработку персональных данных.</p>
          </div>

          <div className={styles.nameGrid}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldCaption}>Фамилия</span>
              <input
                className={styles.inputField}
                id="last-name"
                type="text"
                name="lastName"
                placeholder="Ваша фамилия"
                required
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldCaption}>Имя</span>
              <input
                className={styles.inputField}
                id="first-name"
                type="text"
                name="firstName"
                placeholder="Ваше имя"
                required
              />
            </label>

            <label className={`${styles.fieldGroup} ${styles.nameFieldWide}`}>
              <span className={styles.fieldCaption}>Отчество</span>
              <input
                className={styles.inputField}
                id="middle-name"
                type="text"
                name="middleName"
                placeholder="Если есть"
              />
            </label>
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
              placeholder="Не менее 8 символов"
              minLength={8}
              required
            />
          </label>

          <div className={styles.roleBlock}>
            <p className={styles.fieldLabel}>Присоединиться как</p>
            <div className={styles.roleOptions}>
              <label className={styles.roleOption}>
                <input type="radio" id="participant" name="role" value="participant" defaultChecked required />
                <span className={styles.textRole}>Участник</span>
              </label>

              <label className={styles.roleOption}>
                <input type="radio" id="organizer" name="role" value="organizer" />
                <span className={styles.textRole}>Организатор</span>
              </label>
            </div>
          </div>

          <div className={`${styles.agreementForm} ${agreementError ? styles.agreementFormError : ""}`}>
            <label className={styles.agreementLabel} htmlFor="agreement">
              <input
                className={styles.agreementCheckbox}
                type="checkbox"
                id="agreement"
                name="agreement"
                checked={agreementChecked}
                onChange={handleAgreementChange}
                onInvalid={() => setAgreementError(true)}
                required
              />
              <span>Разрешаю обработку персональных данных</span>
            </label>
            {agreementError && <p className={styles.errorText}>Поставьте галочку, чтобы продолжить регистрацию.</p>}
          </div>

          {submitError && <p className={styles.submitError}>{submitError}</p>}
          {submitSuccess && <p className={styles.submitSuccess}>{submitSuccess}</p>}

          <button type="submit" className={styles.authButton} disabled={isSubmitting}>
            {isSubmitting ? "Сохраняем..." : "Зарегистрироваться"}
          </button>

          <div className={styles.textLink}>
            <p className={styles.loginPrompt}>Уже есть аккаунт?</p>
            <Link to="/login" className={styles.backLink}>
              Войти
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
