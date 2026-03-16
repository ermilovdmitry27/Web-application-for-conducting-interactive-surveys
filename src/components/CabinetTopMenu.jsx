import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import { getStoredTheme, setThemePreference, THEMES, THEME_CHANGE_EVENT } from "../lib/theme";

const MENU_ITEMS = [
  { key: "profile", label: "Профиль", icon: "profile" },
  { key: "progress", label: "Успеваемость", icon: "stats" },
  { key: "settings", label: "Настройки", icon: "settings" },
];

function normalizeNameToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildFullName({ userName, userFirstName, userLastName, userMiddleName }) {
  const firstName = normalizeNameToken(userFirstName);
  const lastName = normalizeNameToken(userLastName);
  const middleName = normalizeNameToken(userMiddleName);

  if (firstName || lastName || middleName) {
    return [lastName, firstName, middleName].filter(Boolean).join(" ");
  }

  return normalizeNameToken(userName) || "Пользователь";
}

function buildCompactName({ userName, userFirstName, userLastName, userMiddleName }) {
  const firstName = normalizeNameToken(userFirstName);
  const lastName = normalizeNameToken(userLastName);
  const middleName = normalizeNameToken(userMiddleName);

  if (firstName) {
    const initials = [lastName, middleName]
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(" ");
    return initials ? `${firstName} ${initials}` : firstName;
  }

  const parts = normalizeNameToken(userName).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const [last, first, middle] = parts;
    const initials = [last, middle]
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(" ");
    return initials ? `${first} ${initials}` : first;
  }

  return normalizeNameToken(userName) || "Пользователь";
}

function Icon({ type, className }) {
  if (type === "profile") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M5.5 18a6.5 6.5 0 0113 0" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === "stats") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="4" y="12" width="3" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="10.5" y="8" width="3" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="17" y="5" width="3" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === "settings") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M19 12l2-1-1-3-2.3.2-1.1-1.8 1-2-2.8-1.6-1.4 1.8h-2.2L9.8 2.8 7 4.4l1 2L6.9 8.2 4.6 8 3.6 11l2 1-.1 2.2-1.9 1 1 3 2.3-.2 1.1 1.8-1 2L9.8 23l1.4-1.8h2.2l1.4 1.8 2.8-1.6-1-2 1.1-1.8 2.3.2 1-3-2-1z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (type === "chevron") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          d="M6.75 9.75L12 15l5.25-5.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 7l5 5-5 5M19 12H9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function CabinetTopMenu({
  userName,
  userFirstName = "",
  userLastName = "",
  userMiddleName = "",
  onLogout,
  initialAvatar = "",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => getStoredTheme());
  const [avatarSrc, setAvatarSrc] = useState(initialAvatar || "");
  const wrapRef = useRef(null);
  const fullUserName = buildFullName({ userName, userFirstName, userLastName, userMiddleName });
  const compactUserName = buildCompactName({ userName, userFirstName, userLastName, userMiddleName });

  useEffect(() => {
    setAvatarSrc(initialAvatar || "");
  }, [initialAvatar]);

  useEffect(() => {
    const handleThemeChange = (event) => {
      const nextTheme = event?.detail?.theme;
      setCurrentTheme(nextTheme === THEMES.LIGHT ? THEMES.LIGHT : getStoredTheme());
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsSettingsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapRef.current || wrapRef.current.contains(event.target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const handleThemeSelect = (nextTheme) => {
    const appliedTheme = setThemePreference(nextTheme);
    setCurrentTheme(appliedTheme);
  };

  const handleOpenProfile = () => {
    setIsOpen(false);
    if (location.pathname !== "/profile") {
      navigate("/profile");
    }
  };

  const handleMenuItemClick = (key) => {
    if (key === "profile") {
      handleOpenProfile();
      return;
    }
    if (key === "settings") {
      setIsSettingsOpen((prev) => !prev);
      return;
    }
  };

  return (
    <div className={styles.topbarActions} ref={wrapRef}>
      <div className={styles.profileArea}>
        <div className={styles.profileTrigger}>
          <button
            type="button"
            className={styles.avatarUploadButton}
            onClick={handleOpenProfile}
            aria-label="Открыть страницу профиля"
            title="Профиль"
          >
            <span className={styles.avatarBadge}>
              {avatarSrc ? (
                <img src={avatarSrc} alt="Аватар" className={styles.avatarImage} />
              ) : (
                <Icon type="profile" className={styles.avatarIcon} />
              )}
            </span>
          </button>
          <div className={styles.profileSummary}>
            <span className={styles.profileLabel}>Аккаунт</span>
            <span className={styles.profileUser}>{compactUserName}</span>
          </div>
          <button
            type="button"
            className={styles.chevronButton}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-label="Открыть меню профиля"
          >
            <Icon
              type="chevron"
              className={`${styles.profileChevron} ${isOpen ? styles.profileChevronOpen : ""}`}
            />
          </button>
        </div>

        {isOpen && (
          <div className={styles.profileMenu}>
            <p className={styles.profileName}>{fullUserName}</p>
            <ul className={styles.menuList}>
              {MENU_ITEMS.map((item) => {
                const isActive = item.key === "settings" && isSettingsOpen;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`${styles.menuItemButton} ${isActive ? styles.menuItemButtonActive : ""}`}
                      onClick={item.key === "progress" ? undefined : () => handleMenuItemClick(item.key)}
                      aria-pressed={item.key === "settings" ? isSettingsOpen : undefined}
                      aria-expanded={item.key === "settings" ? isSettingsOpen : undefined}
                      aria-controls={item.key === "settings" ? "settings-panel" : undefined}
                    >
                      <Icon type={item.icon} className={styles.menuIcon} />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {isSettingsOpen && (
              <div id="settings-panel" className={styles.settingsPanel}>
                <p className={styles.settingsLabel}>Тема интерфейса</p>
                <div className={styles.themeSwitch}>
                  <button
                    type="button"
                    className={`${styles.themeOption} ${
                      currentTheme === THEMES.DARK ? styles.themeOptionActive : ""
                    }`}
                    onClick={() => handleThemeSelect(THEMES.DARK)}
                    aria-pressed={currentTheme === THEMES.DARK}
                  >
                    Темная
                  </button>
                  <button
                    type="button"
                    className={`${styles.themeOption} ${
                      currentTheme === THEMES.LIGHT ? styles.themeOptionActive : ""
                    }`}
                    onClick={() => handleThemeSelect(THEMES.LIGHT)}
                    aria-pressed={currentTheme === THEMES.LIGHT}
                  >
                    Светлая
                  </button>
                </div>
                <p className={styles.themeHint}>Выбор сохраняется для всех экранов приложения.</p>
              </div>
            )}
            <button type="button" className={styles.menuItemButton} onClick={onLogout}>
              <Icon type="logout" className={styles.menuIcon} />
              <span>Выйти</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
