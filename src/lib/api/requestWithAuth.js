export async function requestWithAuth(url, options = {}) {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    throw new Error("Сессия истекла. Войдите заново.");
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (_error) {
    throw new Error("Нет связи с API. Проверьте, что backend запущен и адрес сервера доступен.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Ошибка запроса (${response.status}).`);
  }
  return data;
}
