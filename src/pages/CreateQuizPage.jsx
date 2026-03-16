import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import cabinetStyles from "../css/CabinetPage.module.css";
import styles from "../css/CreateQuizPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth } from "../lib/api/requestWithAuth";
import QuizBasicsSection from "./create-quiz/QuizBasicsSection";
import QuizHeroSection from "./create-quiz/QuizHeroSection";
import QuizTimingSection from "./create-quiz/QuizTimingSection";
import QuestionCard from "./create-quiz/QuestionCard";
import QuizRulesSection from "./create-quiz/QuizRulesSection";
import {
  CATEGORY_OPTIONS,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUESTION_TIME_SECONDS,
  DEFAULT_QUESTIONS,
  MAX_ATTEMPTS_PER_PARTICIPANT,
  MAX_OPTIONS,
  MAX_QUESTION_TIME_SECONDS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_QUESTION_TIME_SECONDS,
  MIN_QUESTIONS,
  QUESTION_IMAGE_TYPES,
} from "./create-quiz/constants";
import {
  buildQuestions,
  createEmptyOption,
  normalizeQuestionsForForm,
} from "./create-quiz/form-utils";

function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export default function CreateQuizPage() {
  const navigate = useNavigate();
  const { quizId: rawQuizId = "" } = useParams();
  const user = getStoredUser();
  const apiBaseUrl = getApiBaseUrl();
  const quizId = Number(rawQuizId);
  const isEditMode = Number.isInteger(quizId) && quizId > 0;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [questionTimeSeconds, setQuestionTimeSeconds] = useState(DEFAULT_QUESTION_TIME_SECONDS);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTIONS);
  const [isActive, setIsActive] = useState(true);
  const [allowBackNavigation, setAllowBackNavigation] = useState(false);
  const [showCorrectAfterAnswer, setShowCorrectAfterAnswer] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [questions, setQuestions] = useState(() =>
    buildQuestions(DEFAULT_QUESTIONS, [])
  );

  const [isPageLoading, setIsPageLoading] = useState(isEditMode);
  const [pageError, setPageError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [questionUploadStates, setQuestionUploadStates] = useState({});

  const totalOptions = useMemo(
    () => questions.reduce((sum, question) => sum + question.options.length, 0),
    [questions]
  );
  const categoryOptions = useMemo(() => {
    const normalized = String(category || "").trim();
    if (!normalized) {
      return CATEGORY_OPTIONS;
    }
    if (CATEGORY_OPTIONS.some((option) => option.value === normalized)) {
      return CATEGORY_OPTIONS;
    }
    return [{ value: normalized, label: normalized }, ...CATEGORY_OPTIONS];
  }, [category]);
  const selectedCategoryLabel = useMemo(() => {
    const matched = categoryOptions.find((option) => option.value === category);
    return matched?.label || category;
  }, [category, categoryOptions]);

  const updateQuestionUploadState = useCallback((questionIndex, patch) => {
    setQuestionUploadStates((prev) => ({
      ...prev,
      [questionIndex]: {
        ...(prev[questionIndex] || {}),
        ...patch,
      },
    }));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    let isMounted = true;

    const loadQuizForEdit = async () => {
      if (!isEditMode) {
        setIsPageLoading(false);
        setPageError("");
        return;
      }

      try {
        setIsPageLoading(true);
        setPageError("");
        const data = await requestWithAuth(`${apiBaseUrl}/api/quizzes/${quizId}`, {
          method: "GET",
        });
        const quiz = data?.quiz;
        if (!quiz || typeof quiz !== "object") {
          throw new Error("Не удалось загрузить данные квиза.");
        }

        if (!isMounted) {
          return;
        }

        const normalizedQuestions = normalizeQuestionsForForm(quiz.questions);
        setTitle(typeof quiz.title === "string" ? quiz.title : "");
        setDescription(typeof quiz.description === "string" ? quiz.description : "");
        setCategory(typeof quiz.category === "string" && quiz.category ? quiz.category : CATEGORY_OPTIONS[0].value);
        setDurationMinutes(Number(quiz.durationMinutes || DEFAULT_DURATION_MINUTES));
        setQuestionTimeSeconds(Number(quiz.questionTimeSeconds || DEFAULT_QUESTION_TIME_SECONDS));
        setMaxAttempts(Number(quiz.maxAttemptsPerParticipant || DEFAULT_MAX_ATTEMPTS));
        setIsActive(Boolean(quiz.isActive));
        setAllowBackNavigation(Boolean(quiz.rules?.allowBackNavigation));
        setShowCorrectAfterAnswer(Boolean(quiz.rules?.showCorrectAfterAnswer));
        setShuffleQuestions(Boolean(quiz.rules?.shuffleQuestions));
        setQuestionCount(normalizedQuestions.length);
        setQuestions(normalizedQuestions);
      } catch (error) {
        if (isMounted) {
          setPageError(error.message || "Не удалось загрузить квиз для редактирования.");
        }
      } finally {
        if (isMounted) {
          setIsPageLoading(false);
        }
      }
    };

    loadQuizForEdit();
    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, isEditMode, quizId]);

  const handleQuestionCountChange = (event) => {
    const rawValue = Number(event.target.value);
    const safeCount = Number.isInteger(rawValue)
      ? Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, rawValue))
      : MIN_QUESTIONS;
    setQuestionCount(safeCount);
    setQuestions((prev) => buildQuestions(safeCount, prev));
  };

  const updateQuestion = (questionIndex, updater) => {
    setQuestions((prev) =>
      prev.map((question, currentIndex) =>
        currentIndex === questionIndex ? updater(question) : question
      )
    );
  };

  const handleQuestionField = (questionIndex, field, value) => {
    updateQuestion(questionIndex, (question) => ({
      ...question,
      [field]: value,
    }));
  };

  const handleQuestionImageSelected = async (questionIndex, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!QUESTION_IMAGE_TYPES.has(file.type)) {
      updateQuestionUploadState(questionIndex, {
        isUploading: false,
        error: "Допустимы только изображения PNG, JPG, WEBP или GIF.",
      });
      return;
    }

    const token = localStorage.getItem("auth_token");
    if (!token) {
      updateQuestionUploadState(questionIndex, {
        isUploading: false,
        error: "Сессия истекла. Войдите заново.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
      updateQuestionUploadState(questionIndex, {
        isUploading: true,
        error: "",
      });

      const response = await fetch(`${apiBaseUrl}/api/uploads/question-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Не удалось загрузить изображение.");
      }

      handleQuestionField(questionIndex, "imageUrl", typeof data.imageUrl === "string" ? data.imageUrl : "");
      updateQuestionUploadState(questionIndex, {
        isUploading: false,
        error: "",
      });
    } catch (error) {
      updateQuestionUploadState(questionIndex, {
        isUploading: false,
        error: error.message || "Не удалось загрузить изображение.",
      });
    }
  };

  const handleQuestionImageRemove = (questionIndex) => {
    handleQuestionField(questionIndex, "imageUrl", "");
    updateQuestionUploadState(questionIndex, {
      isUploading: false,
      error: "",
    });
  };

  const handleAnswerModeChange = (questionIndex, nextMode) => {
    updateQuestion(questionIndex, (question) => {
      const normalizedMode = nextMode === "multiple" ? "multiple" : "single";
      let nextOptions = question.options;

      if (normalizedMode === "single") {
        let found = false;
        nextOptions = question.options.map((option) => {
          if (!found && option.isCorrect) {
            found = true;
            return option;
          }
          return {
            ...option,
            isCorrect: false,
          };
        });
      }

      return {
        ...question,
        answerMode: normalizedMode,
        options: nextOptions,
      };
    });
  };

  const handleOptionTextChange = (questionIndex, optionIndex, value) => {
    updateQuestion(questionIndex, (question) => ({
      ...question,
      options: question.options.map((option, currentOptionIndex) =>
        currentOptionIndex === optionIndex ? { ...option, text: value } : option
      ),
    }));
  };

  const handleOptionCorrectToggle = (questionIndex, optionIndex) => {
    updateQuestion(questionIndex, (question) => {
      const isSingle = question.answerMode === "single";
      const nextOptions = question.options.map((option, currentOptionIndex) => {
        if (currentOptionIndex !== optionIndex) {
          return isSingle ? { ...option, isCorrect: false } : option;
        }
        if (isSingle) {
          return { ...option, isCorrect: true };
        }
        return { ...option, isCorrect: !option.isCorrect };
      });

      return {
        ...question,
        options: nextOptions,
      };
    });
  };

  const handleAddOption = (questionIndex) => {
    updateQuestion(questionIndex, (question) => {
      if (question.options.length >= MAX_OPTIONS) {
        return question;
      }
      return {
        ...question,
        options: [...question.options, createEmptyOption()],
      };
    });
  };

  const handleRemoveOption = (questionIndex, optionIndex) => {
    updateQuestion(questionIndex, (question) => {
      if (question.options.length <= MIN_OPTIONS) {
        return question;
      }
      return {
        ...question,
        options: question.options.filter((_, index) => index !== optionIndex),
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    const nextTitle = title.trim();
    const nextDescription = description.trim();
    const safeDurationMinutes = Number(durationMinutes);
    const safeQuestionTimeSeconds = Number(questionTimeSeconds);
    const safeMaxAttempts = Number(maxAttempts);

    if (!nextTitle) {
      setSubmitError("Введите название квиза.");
      return;
    }
    if (!category) {
      setSubmitError("Выберите категорию.");
      return;
    }
    if (!Number.isInteger(safeDurationMinutes) || safeDurationMinutes < 1) {
      setSubmitError("Время прохождения должно быть целым числом от 1 минуты.");
      return;
    }
    if (
      !Number.isInteger(safeQuestionTimeSeconds) ||
      safeQuestionTimeSeconds < MIN_QUESTION_TIME_SECONDS
    ) {
      setSubmitError(`Время на вопрос должно быть целым числом от ${MIN_QUESTION_TIME_SECONDS} секунд.`);
      return;
    }
    if (safeQuestionTimeSeconds > MAX_QUESTION_TIME_SECONDS) {
      setSubmitError(`Время на вопрос не должно превышать ${MAX_QUESTION_TIME_SECONDS} секунд.`);
      return;
    }
    if (!Number.isInteger(safeMaxAttempts) || safeMaxAttempts < 1) {
      setSubmitError("Лимит попыток должен быть целым числом от 1.");
      return;
    }
    if (safeMaxAttempts > MAX_ATTEMPTS_PER_PARTICIPANT) {
      setSubmitError(`Лимит попыток не должен превышать ${MAX_ATTEMPTS_PER_PARTICIPANT}.`);
      return;
    }

    for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
      const question = questions[questionIndex];
      const prompt = question.prompt.trim();
      const imageUrl = question.imageUrl.trim();

      if (!prompt) {
        setSubmitError(`Заполните текст вопроса №${questionIndex + 1}.`);
        return;
      }
      if (question.type === "image" && !imageUrl) {
        setSubmitError(`Загрузите изображение для вопроса №${questionIndex + 1}.`);
        return;
      }

      const cleanedOptions = question.options.map((option) => ({
        text: option.text.trim(),
        isCorrect: Boolean(option.isCorrect),
      }));
      if (cleanedOptions.some((option) => !option.text)) {
        setSubmitError(`Заполните все варианты ответа в вопросе №${questionIndex + 1}.`);
        return;
      }

      const correctCount = cleanedOptions.filter((option) => option.isCorrect).length;
      if (correctCount === 0) {
        setSubmitError(`В вопросе №${questionIndex + 1} отметьте правильный ответ.`);
        return;
      }
      if (question.answerMode === "single" && correctCount !== 1) {
        setSubmitError(`В вопросе №${questionIndex + 1} для одиночного выбора нужен один правильный ответ.`);
        return;
      }
    }

    const payload = {
      title: nextTitle,
      description: nextDescription,
      category,
      isActive,
      durationMinutes: safeDurationMinutes,
      questionTimeSeconds: safeQuestionTimeSeconds,
      maxAttempts: safeMaxAttempts,
      rules: {
        allowBackNavigation,
        showCorrectAfterAnswer,
        shuffleQuestions,
      },
      questions: questions.map((question) => ({
        type: question.type,
        prompt: question.prompt.trim(),
        imageUrl: question.type === "image" ? question.imageUrl.trim() : "",
        answerMode: question.answerMode,
        options: question.options.map((option) => ({
          text: option.text.trim(),
          isCorrect: Boolean(option.isCorrect),
        })),
      })),
    };

    try {
      setIsSubmitting(true);
      const endpoint = isEditMode
        ? `${apiBaseUrl}/api/quizzes/${quizId}`
        : `${apiBaseUrl}/api/quizzes`;
      await requestWithAuth(endpoint, {
        method: isEditMode ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      navigate("/organizer", { replace: true });
    } catch (error) {
      setSubmitError(
        error.message || (isEditMode ? "Не удалось сохранить квиз." : "Не удалось создать квиз.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={cabinetStyles.page}>
      <header className={cabinetStyles.headerWeb}>
        <h1 className={cabinetStyles.logo}>
          <span className={cabinetStyles.wordColor}>Опрос</span>Мастер
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

      <section className={styles.formCard}>
        <div className={styles.topActions}>
          <button type="button" className={styles.backButton} onClick={() => navigate("/organizer")}>
            К списку квизов
          </button>
          <p className={styles.metaText}>
            Вопросов: {questions.length}, вариантов: {totalOptions}
          </p>
        </div>

        <h1 className={styles.title}>
          {isEditMode ? "Редактирование квиза" : "Создание квиза"}
        </h1>

        {isPageLoading && <p className={styles.metaText}>Загрузка квиза...</p>}
        {!isPageLoading && pageError && <p className={styles.errorText}>{pageError}</p>}

        {!isPageLoading && !pageError && (
          <form className={styles.form} onSubmit={handleSubmit}>
            <QuizHeroSection
              isEditMode={isEditMode}
              selectedCategoryLabel={selectedCategoryLabel}
              questionsCount={questions.length}
              questionTimeSeconds={questionTimeSeconds}
              maxAttempts={maxAttempts}
            />

            <QuizBasicsSection
              title={title}
              description={description}
              category={category}
              categoryOptions={categoryOptions}
              onTitleChange={(event) => setTitle(event.target.value)}
              onCategoryChange={(event) => setCategory(event.target.value)}
              onDescriptionChange={(event) => setDescription(event.target.value)}
            />

            <QuizTimingSection
              durationMinutes={durationMinutes}
              questionTimeSeconds={questionTimeSeconds}
              questionCount={questionCount}
              maxAttempts={maxAttempts}
              onDurationMinutesChange={(event) => setDurationMinutes(Number(event.target.value))}
              onQuestionTimeSecondsChange={(event) => setQuestionTimeSeconds(Number(event.target.value))}
              onQuestionCountChange={handleQuestionCountChange}
              onMaxAttemptsChange={(event) => setMaxAttempts(Number(event.target.value))}
            />

            <QuizRulesSection
              isActive={isActive}
              allowBackNavigation={allowBackNavigation}
              showCorrectAfterAnswer={showCorrectAfterAnswer}
              shuffleQuestions={shuffleQuestions}
              onIsActiveChange={(event) => setIsActive(event.target.checked)}
              onAllowBackNavigationChange={(event) => setAllowBackNavigation(event.target.checked)}
              onShowCorrectAfterAnswerChange={(event) => setShowCorrectAfterAnswer(event.target.checked)}
              onShuffleQuestionsChange={(event) => setShuffleQuestions(event.target.checked)}
            />

            <section className={styles.sectionPanel}>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionEyebrow}>Question flow</p>
                <h2 className={styles.sectionTitle}>Сценарий вопросов</h2>
                <p className={styles.sectionText}>
                  Для каждого шага можно выбрать тип вопроса, режим ответа, изображение и набор правильных вариантов.
                </p>
              </div>

              <div className={styles.questionsWrap}>
                {questions.map((question, questionIndex) => {
                  return (
                    <QuestionCard
                      key={questionIndex}
                      questionIndex={questionIndex}
                      question={question}
                      uploadState={questionUploadStates[questionIndex]}
                      isSubmitting={isSubmitting}
                      onQuestionField={handleQuestionField}
                      onAnswerModeChange={handleAnswerModeChange}
                      onQuestionImageSelected={handleQuestionImageSelected}
                      onQuestionImageRemove={handleQuestionImageRemove}
                      onOptionTextChange={handleOptionTextChange}
                      onOptionCorrectToggle={handleOptionCorrectToggle}
                      onAddOption={handleAddOption}
                      onRemoveOption={handleRemoveOption}
                    />
                  );
                })}
              </div>
            </section>

            {submitError && <p className={styles.errorText}>{submitError}</p>}

            <div className={styles.submitRow}>
              <button type="button" className={styles.secondaryButton} onClick={() => navigate("/organizer")}>
                Отмена
              </button>
              <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
                {isSubmitting
                  ? "Сохраняем..."
                  : isEditMode
                    ? "Сохранить изменения"
                    : "Создать квиз"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
