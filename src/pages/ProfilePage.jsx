import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth as sharedRequestWithAuth } from "../lib/api/requestWithAuth";
import {
  AUTH_USER_UPDATED_EVENT,
  MAX_AVATAR_SIZE,
} from "./profile/constants";
import {
  buildNormalizedUser,
  formatMegabytes,
  getStoredUser,
  normalizeNamePart,
} from "./profile/utils";

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [initialProfileState] = useState(() => {
    const initialUser = buildNormalizedUser(getStoredUser());
    return {
      user: initialUser,
      form: {
        firstName: initialUser.firstName,
        lastName: initialUser.lastName,
        middleName: initialUser.middleName,
        email: initialUser.email,
      },
      avatarSrc: initialUser.avatarDataUrl || "",
    };
  });
  const [user, setUser] = useState(() => initialProfileState.user);
  const [form, setForm] = useState(() => initialProfileState.form);
  const [avatarSrc, setAvatarSrc] = useState(() => initialProfileState.avatarSrc);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    const handleAuthUserUpdated = (event) => {
      const nextUser = buildNormalizedUser(event?.detail?.user || getStoredUser());
      setUser(nextUser);
      setForm({
        firstName: nextUser.firstName,
        lastName: nextUser.lastName,
        middleName: nextUser.middleName,
        email: nextUser.email,
      });
      setAvatarSrc(nextUser.avatarDataUrl || "");
    };

    window.addEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    return () => {
      window.removeEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    };
  }, []);

  const syncStoredUser = (userPatch) => {
    const currentUser = getStoredUser() || {};
    const updatedUser = buildNormalizedUser({
      ...currentUser,
      ...userPatch,
    });
    localStorage.setItem("auth_user", JSON.stringify(updatedUser));
    window.dispatchEvent(new CustomEvent(AUTH_USER_UPDATED_EVENT, { detail: { user: updatedUser } }));
    return updatedUser;
  };

  const requestWithAuth = async (path, options = {}) => {
    try {
      return await sharedRequestWithAuth(`${apiBaseUrl}${path}`, options);
    } catch (error) {
      const message = String(error?.message || "");
      if (path === "/api/users/me/profile" && message === "Ошибка запроса (404).") {
        throw new Error("Профиль не удалось сохранить: backend не перезапущен. Запустите npm run server.");
      }
      if (/^Ошибка запроса \(\d+\)\.$/.test(message)) {
        throw new Error("Не удалось сохранить изменения.");
      }
      throw error;
    }
  };

  const saveProfileToServer = async (payload) => {
    return requestWithAuth("/api/users/me/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  };

  const saveAvatarToServer = async (avatarDataUrl) => {
    return requestWithAuth("/api/users/me/avatar", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ avatarDataUrl }),
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  };

  const handleGoBack = () => {
    navigate(user.role === "organizer" ? "/organizer" : "/participant");
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setFormError("");
    setFormSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      formElement.reportValidity();
      return;
    }

    const payload = {
      firstName: normalizeNamePart(form.firstName),
      lastName: normalizeNamePart(form.lastName),
      middleName: normalizeNamePart(form.middleName),
      email: String(form.email || "").trim().toLowerCase(),
    };

    try {
      setIsSaving(true);
      setFormError("");
      setFormSuccess("");
      const data = await saveProfileToServer(payload);
      const updatedUser = syncStoredUser(data?.user || payload);
      setUser(updatedUser);
      setForm({
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        middleName: updatedUser.middleName,
        email: updatedUser.email,
      });
      setFormSuccess("Профиль сохранен.");
    } catch (error) {
      setFormError(error.message || "Не удалось сохранить профиль.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFormError("Выберите файл изображения.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setFormError(`Файл слишком большой. Максимум ${formatMegabytes(MAX_AVATAR_SIZE)} MB.`);
      return;
    }

    const previousAvatar = avatarSrc;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setFormError("Не удалось прочитать изображение.");
        return;
      }

      setAvatarSrc(result);
      setFormError("");
      setFormSuccess("");
      setIsUploading(true);
      try {
        const data = await saveAvatarToServer(result);
        const updatedUser = syncStoredUser(data?.user || { avatarDataUrl: result });
        setUser(updatedUser);
        setAvatarSrc(updatedUser.avatarDataUrl || result);
        setFormSuccess("Фото профиля обновлено.");
      } catch (error) {
        setAvatarSrc(previousAvatar);
        setFormError(error.message || "Не удалось сохранить фото.");
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      setFormError("Не удалось загрузить изображение.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className={styles.page}>
      <header className={styles.headerWeb}>
        <h1 className={styles.logo}>
          <span className={styles.wordColor}>Опрос</span>Мастер
        </h1>
        <CabinetTopMenu
          userName={user?.name}
          userFirstName={user?.firstName}
          userLastName={user?.lastName}
          userMiddleName={user?.middleName}
          userEmail={user?.email}
          initialAvatar={user?.avatarDataUrl}
          onLogout={handleLogout}
        />
      </header>

      <section className={styles.workspaceShell}>
        <div className={styles.profilePageGridSingle}>
          <section className={`${styles.archiveSection} ${styles.profilePageCard}`}>
            <div className={styles.profileEditorGrid}>
              <aside className={styles.profileMediaCard}>
                <span className={`${styles.profilePanelAvatar} ${styles.profilePanelAvatarLarge}`}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Аватар профиля" className={styles.avatarImage} />
                  ) : (
                    <span className={styles.avatarIconWrap}>
                      <svg viewBox="0 0 24 24" className={styles.avatarIcon} aria-hidden="true">
                        <circle cx="12" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M5.5 18a6.5 6.5 0 0113 0" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                  )}
                </span>
                <div className={styles.profileMediaBody}>
                  <p className={styles.profileMediaTitle}>Фото профиля</p>
                  <p className={styles.profileMediaHint}>Показывается в шапке и меню аккаунта.</p>
                  <div className={styles.profileFormatRow}>
                    <span className={styles.metaPill}>JPG</span>
                    <span className={styles.metaPill}>PNG</span>
                    <span className={styles.metaPill}>WEBP</span>
                    <span className={styles.metaPill}>GIF</span>
                    <span className={styles.metaPill}>до {formatMegabytes(MAX_AVATAR_SIZE)} MB</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.panelSecondaryButton} ${styles.profileMediaButton}`}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSaving}
                >
                  {isUploading ? "Сохраняем фото..." : "Изменить фото"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="Выбрать фото профиля"
                  className={styles.hiddenFileInput}
                  onChange={handleAvatarChange}
                />
              </aside>

              <form className={styles.profileFormSurface} onSubmit={handleSubmit}>
                <div className={styles.profileFieldsGrid}>
                  <label className={styles.panelField}>
                    <span className={styles.panelFieldCaption}>Фамилия</span>
                    <input
                      className={styles.panelInput}
                      type="text"
                      name="lastName"
                      value={form.lastName}
                      onChange={handleFieldChange}
                      required
                    />
                  </label>
                  <label className={styles.panelField}>
                    <span className={styles.panelFieldCaption}>Имя</span>
                    <input
                      className={styles.panelInput}
                      type="text"
                      name="firstName"
                      value={form.firstName}
                      onChange={handleFieldChange}
                      required
                    />
                  </label>
                  <label className={`${styles.panelField} ${styles.profileFieldWide}`}>
                    <span className={styles.panelFieldCaption}>Отчество</span>
                    <input
                      className={styles.panelInput}
                      type="text"
                      name="middleName"
                      value={form.middleName}
                      onChange={handleFieldChange}
                    />
                  </label>
                  <label className={`${styles.panelField} ${styles.profileFieldWide}`}>
                    <span className={styles.panelFieldCaption}>Логин</span>
                    <input
                      className={styles.panelInput}
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleFieldChange}
                      required
                    />
                  </label>
                </div>

                {formError && <p className={styles.panelError}>{formError}</p>}
                {formSuccess && <p className={styles.panelSuccess}>{formSuccess}</p>}

                <div className={styles.profileActionRow}>
                  <button
                    type="button"
                    className={styles.panelSecondaryButton}
                    onClick={handleGoBack}
                    disabled={isSaving || isUploading}
                  >
                    Назад в кабинет
                  </button>
                  <button type="submit" className={styles.panelPrimaryButton} disabled={isSaving || isUploading}>
                    {isSaving ? "Сохраняем..." : "Сохранить изменения"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
