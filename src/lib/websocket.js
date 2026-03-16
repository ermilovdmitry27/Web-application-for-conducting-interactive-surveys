const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_WS_PATH = "/ws";

export function buildWebSocketUrl() {
  const apiBaseUrl = process.env.REACT_APP_API_URL || DEFAULT_API_URL;
  const wsPath = process.env.REACT_APP_WS_PATH || DEFAULT_WS_PATH;

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = wsPath;
  url.search = "";
  url.hash = "";

  return url.toString();
}

export function parseWebSocketMessage(rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

