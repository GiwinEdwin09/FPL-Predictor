function trimmedBaseUrl() {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error("API_BASE_URL is not configured for the web app.");
  }
  return baseUrl.replace(/\/$/, "");
}

export function backendUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBaseUrl()}${normalizedPath}`;
}
