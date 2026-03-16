export const DEFAULT_API_URL = "http://localhost:4000";

export function getApiBaseUrl() {
  return process.env.REACT_APP_API_URL || DEFAULT_API_URL;
}
