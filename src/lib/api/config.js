const DEFAULT_API_PORT = "4000";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
let cachedApiBaseUrl = "";

export const DEFAULT_API_URL = `http://localhost:${DEFAULT_API_PORT}`;

function normalizeApiUrl(value) {
  const normalizedValue = String(value || "").trim();
  return normalizedValue.replace(/\/+$/, "");
}

function getPortFromUrl(urlValue) {
  try {
    const parsedUrl = new URL(urlValue);
    if (parsedUrl.port) {
      return parsedUrl.port;
    }
    return parsedUrl.protocol === "https:" ? "443" : "80";
  } catch (_error) {
    return DEFAULT_API_PORT;
  }
}

export function getApiBaseUrl() {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  const configuredApiUrl = normalizeApiUrl(process.env.REACT_APP_API_URL || DEFAULT_API_URL);
  const configuredApiPort = getPortFromUrl(configuredApiUrl);

  if (typeof window !== "undefined" && window.location?.hostname) {
    const currentProtocol = window.location.protocol || "http:";
    const currentHostname = window.location.hostname;
    const currentOrigin = normalizeApiUrl(window.location.origin);
    const currentPort = window.location.port || (currentProtocol === "https:" ? "443" : "80");

    if (currentPort === configuredApiPort) {
      cachedApiBaseUrl = currentOrigin;
      return cachedApiBaseUrl;
    }

    if (!LOCAL_HOSTNAMES.has(currentHostname)) {
      cachedApiBaseUrl = `${currentProtocol}//${currentHostname}:${configuredApiPort}`;
      return cachedApiBaseUrl;
    }
  }

  cachedApiBaseUrl = configuredApiUrl;
  return cachedApiBaseUrl;
}

export function resolveApiAssetUrl(rawValue) {
  const assetUrl = String(rawValue || "").trim();
  if (!assetUrl) {
    return "";
  }

  if (/^(data:|blob:)/i.test(assetUrl)) {
    return assetUrl;
  }

  if (assetUrl.startsWith("/")) {
    return `${getApiBaseUrl()}${assetUrl}`;
  }

  return assetUrl;
}
