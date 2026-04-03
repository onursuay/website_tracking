import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

export interface Site {
  id: string;
  url: string;
  name: string;
  addedAt: string;
  lastCheck: string | null;
  status: "up" | "down" | "unknown";
  downSince: string | null;
  notifiedAt: string | null;
  lastError: string | null;
  errorType: string | null;
  responseTime: number | null;
  sslDaysRemaining: number | null;
}

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
    "[Store] Upstash Redis tanimli degil. Lokal veri depolamasi icin data/sites.local.json kullaniliyor."
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
    addedAt: site.addedAt ?? new Date().toISOString(),
    lastCheck: site.lastCheck ?? null,
    status:
      site.status === "up" || site.status === "down" || site.status === "unknown"
        ? site.status
        : "unknown",
    downSince: site.downSince ?? null,
    notifiedAt: site.notifiedAt ?? null,
    lastError: site.lastError ?? null,
    errorType: site.errorType ?? null,
    responseTime:
      typeof site.responseTime === "number" ? site.responseTime : null,
    sslDaysRemaining:
      typeof site.sslDaysRemaining === "number" ? site.sslDaysRemaining : null,
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

    console.error(`[Store] ${filePath} okunamadi:`, error);
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

export async function addSite(url: string, name: string): Promise<Site> {
  const sites = await getSites();
  const site: Site = {
    id: crypto.randomUUID(),
    url,
    name,
    addedAt: new Date().toISOString(),
    lastCheck: null,
    status: "unknown",
    downSince: null,
    notifiedAt: null,
    lastError: null,
    errorType: null,
    responseTime: null,
    sslDaysRemaining: null,
  };
  sites.push(site);
  await saveSites(sites);
  return site;
}

export async function removeSite(id: string): Promise<boolean> {
  const sites = await getSites();
  const filtered = sites.filter((s) => s.id !== id);
  if (filtered.length === sites.length) return false;
  await saveSites(filtered);
  return true;
}

export async function updateSite(
  id: string,
  updates: Partial<Site>
): Promise<void> {
  const sites = await getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) return;
  sites[index] = { ...sites[index], ...updates };
  await saveSites(sites);
}
