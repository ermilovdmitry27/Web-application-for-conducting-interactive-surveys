import { useNavigate } from "react-router-dom";
import styles from "../css/HomePage.module.css";

const PLATFORM_STEPS = [
  {
    label: "01",
    title: "Создание сценария",
    text: "Организатор собирает квиз, настраивает таймеры, правила и структуру комнаты.",
  },
  {
    label: "02",
    title: "Подключение по коду",
    text: "Участники входят без лишних экранов и сразу попадают в live-сессию.",
  },
  {
    label: "03",
    title: "Реальное время",
    text: "Вопросы, ответы, лидерборд и статус комнаты синхронизируются для всех.",
  },
];

const ROLE_CARDS = [
  {
    title: "Для организатора",
    text: "Конструктор квизов, запуск комнаты, контроль таймера, пауза, следующий вопрос и финальный рейтинг.",
  },
  {
    title: "Для участника",
    text: "Быстрый вход по коду комнаты, история попыток, детали ответов и личная статистика по результатам.",
  },
  {
    title: "Для live-сессии",
    text: "Общая логика для эфира: единый темп вопросов, ограничение попыток и сохранение результатов в базе.",
  },
];

function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const token = localStorage.getItem("auth_token");

  const openCabinet = () => {
    if (token && user?.role === "organizer") {
      navigate("/organizer");
      return;
    }
    if (token && user?.role === "participant") {
      navigate("/participant");
      return;
    }
    navigate("/login");
  };

  return (
    <main className={styles.page}>
      <header className={styles.headerWeb}>
        <div className={styles.brandBlock}>
          <h1 className={styles.logo}>
            <span className={styles.wordColor}>Опрос</span>Мастер
          </h1>
        </div>

        <div className={styles.authButtons}>
          <button
            type="button"
            className={`${styles.authButton} ${styles.secondaryAction}`}
            onClick={() => navigate("/registration")}
          >
            Регистрация
          </button>
          <button
            type="button"
            className={`${styles.authButton} ${styles.registerButton}`}
            onClick={openCabinet}
          >
            {token ? "Открыть кабинет" : "Войти"}
          </button>
        </div>
      </header>

      <section className={styles.centerWrap}>
        <div className={styles.bodyWebSite}>
          <section className={styles.centerElement}>
            <section className={styles.heroCopy}>
              <h2 className={styles.centerTitle}>
                Управляйте квизом, live-комнатой и результатами в одной системе.
              </h2>
              <p className={styles.heroLead}>
                ОпросМастер соединяет создание сценария, вход по коду, realtime-эфир и финальный лидерборд
                в одном аккуратном продукте без перегруженных экранов.
              </p>

              <div className={`${styles.authButtons} ${styles.centerButtons}`}>
                <button
                  type="button"
                  className={`${styles.authButton} ${styles.createQuizButton}`}
                  onClick={() => {
                    if (token) {
                      openCabinet();
                      return;
                    }
                    navigate("/registration");
                  }}
                >
                  Начать работу
                </button>
                <button
                  type="button"
                  className={`${styles.authButton} ${styles.addButton}`}
                  onClick={() => {
                    if (token) {
                      openCabinet();
                      return;
                    }
                    navigate("/login");
                  }}
                >
                  Открыть демо-поток
                </button>
              </div>
            </section>

            <aside className={styles.heroPanel}>
              <div className={styles.heroPanelHeader}>
                <h3 className={styles.panelTitle}>Как работает платформа</h3>
              </div>

              <div className={styles.stepList}>
                {PLATFORM_STEPS.map((step) => (
                  <article key={step.label} className={styles.stepCard}>
                    <p className={styles.stepLabel}>{step.label}</p>
                    <h4 className={styles.stepTitle}>{step.title}</h4>
                    <p className={styles.stepText}>{step.text}</p>
                  </article>
                ))}
              </div>
            </aside>
          </section>

          <section className={styles.roleGrid}>
            {ROLE_CARDS.map((card) => (
              <article key={card.title} className={styles.roleCard}>
                <h3 className={styles.roleCardTitle}>{card.title}</h3>
                <p className={styles.roleCardText}>{card.text}</p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
