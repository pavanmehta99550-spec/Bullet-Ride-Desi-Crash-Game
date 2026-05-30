// src/lib/api.ts

export const getBackendUrl = (): string => {
  if (typeof window === "undefined" || !window.location) {
    return "https://ais-dev-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app";
  }

  // 1. Check if user configured a custom backend URL override in localStorage
  try {
    const customUrl = localStorage.getItem("CUSTOM_BACKEND_URL");
    if (customUrl) return customUrl;
  } catch (e) {}

  // 2. Check build-time environment variable VITE_BACKEND_API_URL (custom configuration on Vercel)
  const envUrl = (import.meta as any).env?.VITE_BACKEND_API_URL;
  if (envUrl) return envUrl;

  const hostname = window.location.hostname;
  
  // 3. If running locally or on AI Studio's Cloud Run environment, use the active window origin
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("run.app")) {
    return window.location.origin;
  }
  
  // 4. If running on Vercel, distinguish between development and pre-release (production) hostnames
  if (hostname.includes("bullet-ride-desi-crash-game") || hostname.includes("vercel")) {
    return "https://ais-pre-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app";
  }
  
  // 5. Default fallback to the development backend container URL
  return "https://ais-dev-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app";
};

export const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  
  if (url.startsWith("/api")) {
    const backendUrl = getBackendUrl();
    const fullUrl = `${backendUrl}${url}`;
    if (typeof input === "string") {
      input = fullUrl;
    } else if (input instanceof URL) {
      input = new URL(fullUrl);
    } else {
      input = new Request(fullUrl, input as RequestInit);
    }
  }
  return fetch(input, init);
};

export const safeFetchJson = async <T = any>(url: string, options?: RequestInit): Promise<T> => {
  const res = await customFetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Non-JSON response received`);
  }
  return await res.json();
};
