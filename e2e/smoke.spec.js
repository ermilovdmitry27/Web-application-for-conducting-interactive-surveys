const { test, expect } = require("@playwright/test");

const organizerUser = {
  id: 1,
  role: "organizer",
  firstName: "Анна",
  lastName: "Иванова",
  email: "anna@example.com",
};

const participantUser = {
  id: 7,
  role: "participant",
  firstName: "Алиса",
  lastName: "Соколова",
  email: "alice@example.com",
};

async function seedAuth(page, user, token) {
  await page.addInitScript(
    ({ nextUser, nextToken }) => {
      localStorage.setItem("auth_user", JSON.stringify(nextUser));
      localStorage.setItem("auth_token", nextToken);
    },
    { nextUser: user, nextToken: token }
  );
}

async function fulfillJson(route, data, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}

test("organizer creates an image quiz in a real browser and returns to the cabinet", async ({
  page,
}) => {
  let createdQuizPayload = null;

  await seedAuth(page, organizerUser, "organizer-token");

  await page.route("**/api/uploads/question-image", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe("Bearer organizer-token");
    await fulfillJson(route, {
      imageUrl: "/uploads/questions/browser-smoke.png",
    });
  });

  await page.route("**/api/quizzes", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    createdQuizPayload = route.request().postDataJSON();
    await fulfillJson(route, {
      quiz: {
        id: 501,
      },
    }, 201);
  });

  await page.route("**/api/quizzes/mine", async (route) => {
    await fulfillJson(route, {
      quizzes: [
        {
          id: 501,
          title: "Browser Smoke Quiz",
          joinCode: "ROOM77",
          category: "history",
          questionCount: 1,
          durationMinutes: 15,
          questionTimeSeconds: 30,
          maxAttemptsPerParticipant: 1,
          isActive: true,
        },
      ],
    });
  });

  await page.route("**/api/quizzes/mine/attempts?limit=150", async (route) => {
    await fulfillJson(route, { attempts: [] });
  });

  await page.route("**/api/live-sessions/mine?limit=20", async (route) => {
    await fulfillJson(route, { sessions: [] });
  });

  await page.goto("/organizer/quizzes/new");

  await page.getByLabel("Название квиза").fill("Browser Smoke Quiz");
  await page.getByLabel("Количество вопросов").fill("1");
  await page.getByLabel("Тип вопроса 1").selectOption("image");
  await page.getByPlaceholder("Введите вопрос").fill("Что изображено на фото?");
  await page.getByPlaceholder("Вариант 1").fill("Ответ A");
  await page.getByPlaceholder("Вариант 2").fill("Ответ B");
  await page.getByLabel("Верный").first().check();
  await page.getByLabel("Загрузить изображение вопроса 1").setInputFiles({
    name: "question.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });

  await expect(page.getByAltText("Иллюстрация для вопроса 1")).toBeVisible();

  await page.getByRole("button", { name: "Создать квиз" }).click();

  await expect(page).toHaveURL(/\/organizer$/);
  await expect(page.getByText("Browser Smoke Quiz")).toBeVisible();

  expect(createdQuizPayload).toMatchObject({
    title: "Browser Smoke Quiz",
    category: "history",
    isActive: true,
    durationMinutes: 15,
    questionTimeSeconds: 30,
    maxAttempts: 1,
  });
  expect(createdQuizPayload.questions).toEqual([
    {
      type: "image",
      prompt: "Что изображено на фото?",
      imageUrl: "/uploads/questions/browser-smoke.png",
      answerMode: "single",
      options: [
        { text: "Ответ A", isCorrect: true },
        { text: "Ответ B", isCorrect: false },
      ],
    },
  ]);
});

test("participant opens history in a real browser, loads leaderboard details, and deletes a group", async ({
  page,
}) => {
  await seedAuth(page, participantUser, "participant-token");

  await page.route("**/api/attempts/mine", async (route) => {
    await fulfillJson(route, {
      attempts: [
        {
          id: 101,
          quizId: 12,
          quizTitle: "History Sprint",
          createdAt: "2026-03-28T12:00:00.000Z",
          score: 8,
          maxScore: 10,
          percentage: 80,
          timeSpentSeconds: 95,
          answeredQuestionsCount: 8,
          isLive: true,
          liveSessionId: 77,
          answers: [
            {
              questionPosition: 1,
              prompt: "Когда началась перестройка?",
              optionTexts: ["1985"],
              isCorrect: true,
              submittedAfterSeconds: 3,
            },
          ],
        },
      ],
    });
  });

  await page.route("**/api/live-sessions/77/leaderboard", async (route) => {
    await fulfillJson(route, {
      leaderboard: {
        entries: [
          {
            participantId: 7,
            participantName: "Алиса Соколова",
            score: 8,
            maxScore: 10,
            percentage: 80,
            place: 1,
          },
        ],
      },
    });
  });

  await page.route("**/api/attempts/mine/12", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    await fulfillJson(route, {});
  });

  await page.goto("/participant");

  await expect(
    page.getByText("Алиса, подключайтесь к live-квизам и сохраняйте каждую попытку в одном личном пространстве.")
  ).toBeVisible();
  await expect(page.getByText("History Sprint")).toBeVisible();

  await page.getByRole("button", { name: "Открыть live-квиз" }).click();
  await expect(page.getByText("Введите код комнаты.")).toBeVisible();

  await page.getByRole("button", { name: "Развернуть группу" }).click();
  await page.getByRole("button", { name: "Подробнее" }).click();

  await expect(page.getByText("Итоговый лидерборд live-сессии")).toBeVisible();
  await expect(page.getByText("Ваше место: #1")).toBeVisible();
  await expect(page.getByText(/#1 Алиса Соколова/)).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      'Удалить все ваши попытки по квизу "History Sprint"? Это действие нельзя отменить.'
    );
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Удалить попытки" }).click();
  await expect(page.getByText("История пока пустая.")).toBeVisible();
});
