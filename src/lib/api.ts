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

let cachedWorkingBackend: string | null = (typeof window !== "undefined" ? localStorage.getItem("CACHED_WORKING_BACKEND_URL") : null);

export const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  
  if (url.startsWith("/api")) {
    // Determine the primary backend URL
    let primaryBackend = getBackendUrl();
    
    // If we have a cached working backend and are not using a forced user custom one, prefer the working one
    const userCustomBackend = typeof window !== "undefined" ? localStorage.getItem("CUSTOM_BACKEND_URL") : null;
    if (cachedWorkingBackend && !userCustomBackend) {
      primaryBackend = cachedWorkingBackend;
    }

    const primaryUrl = `${primaryBackend}${url}`;
    
    // Fallback options
    const fallbackUrls = [
      "https://ais-dev-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app",
      "https://ais-pre-zyv7gx6kmtq6krourr7sy7-814520408801.asia-southeast1.run.app"
    ].filter(u => u !== primaryBackend);

    let targetInput: RequestInfo | URL = input;
    if (typeof input === "string") {
      targetInput = primaryUrl;
    } else if (input instanceof URL) {
      targetInput = new URL(primaryUrl);
    } else {
      targetInput = new Request(primaryUrl, input as RequestInit);
    }

    try {
      const response = await fetch(targetInput, init);
      if (response.status === 502 || response.status === 503 || response.status === 552) {
        throw new Error(`Instance unresponsive (${response.status})`);
      }
      return response;
    } catch (err) {
      console.warn(`[CUSTOM FETCH] Failed to connect to primary backend: ${primaryUrl}. Trying backends fallback...`, err);
      
      // If we are overriding with a custom URL, don't try other random fallbacks, just throw the error
      if (userCustomBackend) {
        throw err;
      }

      for (const fallbackBackend of fallbackUrls) {
        const fallbackUrl = `${fallbackBackend}${url}`;
        console.log(`[CUSTOM FETCH] Trying auto-failover target: ${fallbackUrl}`);
        
        let fbInput: RequestInfo | URL = input;
        if (typeof input === "string") {
          fbInput = fallbackUrl;
        } else if (input instanceof URL) {
          fbInput = new URL(fallbackUrl);
        } else {
          fbInput = new Request(fallbackUrl, input as RequestInit);
        }

        try {
          const response = await fetch(fbInput, init);
          if (response.ok || (response.status >= 200 && response.status < 500)) {
            console.log(`[CUSTOM FETCH] Auto-healing success! Switched to: ${fallbackBackend}`);
            cachedWorkingBackend = fallbackBackend;
            if (typeof window !== "undefined") {
              localStorage.setItem("CACHED_WORKING_BACKEND_URL", fallbackBackend);
            }
            return response;
          }
        } catch (fbErr) {
          console.warn(`[CUSTOM FETCH] Fallback fail to ${fallbackUrl}:`, fbErr);
        }
      }
      throw err;
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
