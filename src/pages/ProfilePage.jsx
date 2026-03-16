import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";

const AUTH_USER_UPDATED_EVENT = "auth-user-updated";
const DEFAULT_MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE = Number(process.env.REACT_APP_MAX_AVATAR_SIZE || DEFAULT_MAX_AVATAR_SIZE);

function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function normalizeNamePart(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function splitFullName(value) {
  const parts = normalizeNamePart(value).split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] || "",
    firstName: parts[1] || parts[0] || "",
    middleName: parts.slice(2).join(" "),
  };
}

function buildNormalizedUser(rawUser) {
  const source = rawUser || {};
  const fallback = splitFullName(source.name);
  return {
    ...source,
    firstName: normalizeNamePart(source.firstName) || fallback.firstName,
    lastName: normalizeNamePart(source.lastName) || fallback.lastName,
    middleName: normalizeNamePart(source.middleName) || fallback.middleName,
    email: typeof source.email === "string" ? source.email.trim().toLowerCase() : "",
    avatarDataUrl: source.avatarDataUrl || "",
  };
}

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [user, setUser] = useState(() => buildNormalizedUser(getStoredUser()));
  const [form, setForm] = useState(() => ({
    firstName: buildNormalizedUser(getStoredUser()).firstName,
    lastName: buildNormalizedUser(getStoredUser()).lastName,
    middleName: buildNormalizedUser(getStoredUser()).middleName,
    email: buildNormalizedUser(getStoredUser()).email,
  }));
  const [avatarSrc, setAvatarSrc] = useState(() => buildNormalizedUser(getStoredUser()).avatarDataUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

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
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Сессия истекла. Войдите заново.");
    }

    const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:4000";
    let response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    } catch (_error) {
      throw new Error("Нет связи с API. Запустите сервер: npm run server");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 && path === "/api/users/me/profile") {
        throw new Error("Профиль не удалось сохранить: backend не перезапущен. Запустите npm run server.");
      }
      throw new Error(data.message || "Не удалось сохранить изменения.");
    }
    return data;
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
