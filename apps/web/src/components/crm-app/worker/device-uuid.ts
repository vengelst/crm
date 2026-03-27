const DEVICE_UUID_KEY = "crm-kiosk-device-uuid";

export function getDeviceUuid(): string {
  if (typeof window === "undefined") return "";
  let uuid = window.localStorage.getItem(DEVICE_UUID_KEY);
  if (!uuid) {
    uuid = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_UUID_KEY, uuid);
  }
  return uuid;
}

export function getDeviceInfo() {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  let platform = "Unknown";
  if (ua.includes("Android")) platform = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";
  else if (ua.includes("Windows")) platform = "Windows";
  else if (ua.includes("Mac")) platform = "macOS";
  else if (ua.includes("Linux")) platform = "Linux";
  return { platform, browser, userAgent: ua.slice(0, 500) };
}
