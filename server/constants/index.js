const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["participant", "organizer"]);
const AVATAR_DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;
const QUESTION_IMAGE_MIME_TO_EXTENSION = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

module.exports = {
  EMAIL_RE,
  ALLOWED_ROLES,
  AVATAR_DATA_URL_RE,
  QUESTION_IMAGE_MIME_TO_EXTENSION,
};
