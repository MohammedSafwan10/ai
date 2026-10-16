export const WINDOWS_DESKTOP_DOWNLOAD_URL =
  "https://updates.nexdark.com/win32/x64/stable/PrivoraSetup.exe";

export const WINDOWS_DESKTOP_RELEASE_URL =
  "https://updates.nexdark.com/win32/x64/stable";

export type DesktopPlatform = "windows" | "macos" | "linux" | "unknown";

export type DesktopDownloadTarget = {
  platform: DesktopPlatform;
  href: string;
  label: string;
  ariaLabel: string;
  direct: boolean;
};

export function detectDesktopPlatform(userAgent = "", platform = ""): DesktopPlatform {
  const source = `${userAgent} ${platform}`.toLowerCase();
  if (source.includes("windows") || source.includes("win32") || source.includes("win64")) return "windows";
  if (source.includes("macintosh") || source.includes("mac os") || source.includes("macintel")) return "macos";
  if (source.includes("linux") || source.includes("x11")) return "linux";
  return "unknown";
}

export function getDesktopDownloadTarget(platform: DesktopPlatform): DesktopDownloadTarget {
  if (platform === "windows") {
    return {
      platform,
      href: WINDOWS_DESKTOP_DOWNLOAD_URL,
      label: "Download",
      ariaLabel: "Download Privora for Windows",
      direct: true,
    };
  }

  return {
    platform,
    href: "/download",
    label: "Download",
    ariaLabel: "View Privora desktop downloads",
    direct: false,
  };
}
