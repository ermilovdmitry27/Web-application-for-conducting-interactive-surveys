export const AUTH_USER_UPDATED_EVENT = "auth-user-updated";
export const DEFAULT_MAX_AVATAR_SIZE = 2 * 1024 * 1024;
export const MAX_AVATAR_SIZE = Number(
  process.env.REACT_APP_MAX_AVATAR_SIZE || DEFAULT_MAX_AVATAR_SIZE
);
