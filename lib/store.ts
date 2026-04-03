import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import {
  normalizeHistory,
  normalizeIncidents,
  normalizeRules,
  sanitizeTags,
  sanitizeText,
} from "@/lib/site-utils";
import { Site } from "@/lib/types";

const SITES_KEY = "uptime:sites";
const SEED_SITES_FILE = path.join(process.cwd(), "data", "sites.json");
const LOCAL_SITES_FILE = path.join(process.cwd(), "data", "sites.local.json");

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

let hasLoggedLocalFallback = false;

function logLocalFallback() {
  if (hasLoggedLocalFallback) return;
  hasLoggedLocalFallback = true;
  console.warn(
    "[Store] Upstash Redis tanımlı değil. Lokal veri depolaması için data/sites.local.json kullanılıyor."
  );
}

function normalizeSite(site: Partial<Site>): Site | null {
  if (!site.id || !site.url || !site.name) {
    return null;
  }

  return {
    id: site.id,
    url: site.url,
    name: site.name,
    group: sanitizeText(site.group) ?? "Genel",
    tags: sanitizeTags(site.tags),
    note: sanitizeText(site.note),
    addedAt: site.addedAt ?? new Date().toISOString(),
    lastCheck: sanitizeText(site.lastCheck),
    status:
      site.status === "up" || site.status === "down" || site.status === "unknown"
        ? site.status
        : "unknown",
    downSince: sanitizeText(site.downSince),
    notifiedAt: sanitizeText(site.notifiedAt),
    lastError: sanitizeText(site.lastError),
    errorType: typeof site.errorType === "string" ? site.errorType : null,
    responseTime:
      typeof site.responseTime === "number" ? site.responseTime : null,
    sslDaysRemaining:
      typeof site.sslDaysRemaining === "number" ? site.sslDaysRemaining : null,
    sslIssuer: sanitizeText(site.sslIssuer),
    sslSubject: sanitizeText(site.sslSubject),
    sslValidFrom: sanitizeText(site.sslValidFrom),
    sslValidTo: sanitizeText(site.sslValidTo),
    rules: normalizeRules(site.rules),
    history: normalizeHistory(site.history),
    incidents: normalizeIncidents(site.incidents),
  };
}

function normalizeSites(sites: unknown): Site[] {
  if (!Array.isArray(sites)) {
    return [];
  }

  return sites
    .map((site) => normalizeSite(site as Partial<Site>))
    .filter((site): site is Site => site !== null);
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    console.error(`[Store] ${filePath} okunamadı:`, error);
    return [];
  }
}

async function ensureLocalSitesFile(): Promise<void> {
  try {
    await fs.access(LOCAL_SITES_FILE);
  } catch {
    const seedSites = normalizeSites(await readJsonArray(SEED_SITES_FILE));
    await fs.mkdir(path.dirname(LOCAL_SITES_FILE), { recursive: true });
    await fs.writeFile(
      LOCAL_SITES_FILE,
      `${JSON.stringify(seedSites, null, 2)}\n`,
      "utf8"
    );
  }
}

async function readSitesFromFile(): Promise<Site[]> {
  logLocalFallback();
  await ensureLocalSitesFile();
  return normalizeSites(await readJsonArray(LOCAL_SITES_FILE));
}

async function saveSitesToFile(sites: Site[]): Promise<void> {
  logLocalFallback();
  await fs.mkdir(path.dirname(LOCAL_SITES_FILE), { recursive: true });
  await fs.writeFile(
    LOCAL_SITES_FILE,
    `${JSON.stringify(normalizeSites(sites), null, 2)}\n`,
    "utf8"
  );
}

export async function getSites(): Promise<Site[]> {
  if (!redis) {
    return readSitesFromFile();
  }

  const data = await redis.get<Site[]>(SITES_KEY);
  return normalizeSites(data);
}

export async function saveSites(sites: Site[]): Promise<void> {
  const normalizedSites = normalizeSites(sites);

  if (!redis) {
    await saveSitesToFile(normalizedSites);
    return;
  }

  await redis.set(SITES_KEY, normalizedSites);
}

export async function addSite(
  payload: Pick<Site, "url" | "name"> & Partial<Pick<Site, "group" | "tags" | "note">>
): Promise<Site> {
  const sites = await getSites();
  const site: Site = normalizeSite({
    id: crypto.randomUUID(),
    url: payload.url,
    name: payload.name,
    group: payload.group ?? "Genel",
    tags: payload.tags ?? [],
    note: payload.note ?? null,
    addedAt: new Date().toISOString(),
    lastCheck: null,
    status: "unknown",
    downSince: null,
    notifiedAt: null,
    lastError: null,
    errorType: null,
    responseTime: null,
    sslDaysRemaining: null,
    sslIssuer: null,
    sslSubject: null,
    sslValidFrom: null,
    sslValidTo: null,
    rules: undefined,
    history: [],
    incidents: [],
  }) as Site;

  sites.push(site);
  await saveSites(sites);
  return site;
}

export async function removeSite(id: string): Promise<boolean> {
  const sites = await getSites();
  const filtered = sites.filter((site) => site.id !== id);
  if (filtered.length === sites.length) return false;
  await saveSites(filtered);
  return true;
}

export async function updateSite(id: string, updates: Partial<Site>): Promise<Site | null> {
  const sites = await getSites();
  const index = sites.findIndex((site) => site.id === id);

  if (index === -1) {
    return null;
  }

  const nextSite = normalizeSite({ ...sites[index], ...updates });

  if (!nextSite) {
    return null;
  }

  sites[index] = nextSite;
  await saveSites(sites);
  return nextSite;
}
