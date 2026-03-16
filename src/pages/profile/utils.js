export function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function normalizeNamePart(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function splitFullName(value) {
  const parts = normalizeNamePart(value).split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] || "",
    firstName: parts[1] || parts[0] || "",
    middleName: parts.slice(2).join(" "),
  };
}

export function buildNormalizedUser(rawUser) {
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

export function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}
