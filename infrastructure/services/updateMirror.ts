/**
 * R2 download mirror (dl.magies.top) for mainland-China users, who cannot
 * reach github.com / api.github.com. CI publishes every release to the mirror
 * alongside the GitHub Release (see build.yml "Sync release to R2").
 *
 * Region detection is a local heuristic (app locale / system timezone) so the
 * preferred source is chosen without a network round-trip; the update check
 * still falls back to the other source when the preferred one fails.
 */

import type { ReleaseInfo } from "./updateService";

export const MIRROR_BASE_URL = "https://dl.magies.top/stable";
export const MIRROR_MANIFEST_URL = `${MIRROR_BASE_URL}/release.json`;

const CN_TIMEZONES = new Set(["Asia/Shanghai", "Asia/Urumqi", "Asia/Chongqing", "Asia/Harbin"]);

export interface RegionHints {
  locale?: string;
  timeZone?: string;
}

export function shouldPreferMirror({ locale, timeZone }: RegionHints): boolean {
  if (locale && /^zh-CN/i.test(locale)) return true;
  if (timeZone && CN_TIMEZONES.has(timeZone)) return true;
  return false;
}

/** Read locale/timezone from the renderer environment (guarded for tests). */
export function detectPreferMirror(): boolean {
  try {
    return shouldPreferMirror({
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return false;
  }
}

export interface MirrorManifest {
  version: string;
  tag: string;
  publishedAt?: string;
  files?: Array<{ name: string; size?: number; url: string }>;
}

export function manifestToReleaseInfo(manifest: MirrorManifest): ReleaseInfo {
  return {
    version: manifest.version.replace(/^v/i, ""),
    tagName: manifest.tag,
    name: `MagiesTerminal ${manifest.tag}`,
    body: "",
    htmlUrl: MIRROR_BASE_URL,
    publishedAt: manifest.publishedAt || "",
    assets: (manifest.files || []).map((file) => ({
      name: file.name,
      browserDownloadUrl: file.url,
      size: file.size ?? 0,
    })),
  };
}
