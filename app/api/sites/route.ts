import { NextRequest, NextResponse } from "next/server";
import { addSite, getSites, removeSite, updateSite } from "@/lib/store";
import {
  normalizeRules,
  sanitizeIsoDate,
  sanitizeStatusCodes,
  sanitizeTags,
  sanitizeText,
} from "@/lib/site-utils";

export async function GET() {
  const sites = await getSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const group = sanitizeText(payload.group) ?? "Genel";
  const tags = sanitizeTags(payload.tags);
  const note = sanitizeText(payload.note);

  if (!url || !name) {
    return NextResponse.json(
      { error: "url ve name alanları zorunlu" },
      { status: 400 }
    );
  }

  let normalizedUrl: string;

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("unsupported_protocol");
    }
    normalizedUrl = parsedUrl.toString();
  } catch {
    return NextResponse.json(
      { error: "Geçersiz URL formatı" },
      { status: 400 }
    );
  }

  const sites = await getSites();
  if (sites.some((site) => site.url === normalizedUrl)) {
    return NextResponse.json(
      { error: "Bu URL zaten izleniyor" },
      { status: 409 }
    );
  }

  const site = await addSite({ url: normalizedUrl, name, group, tags, note });
  return NextResponse.json(site, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const payload = await req.json();
  const id = sanitizeText(payload.id);

  if (!id) {
    return NextResponse.json({ error: "id alanı zorunlu" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("name" in payload) {
    const nextName = sanitizeText(payload.name);
    if (nextName) {
      updates.name = nextName;
    }
  }
  if ("group" in payload) {
    updates.group = sanitizeText(payload.group) ?? "Genel";
  }
  if ("tags" in payload) {
    updates.tags = sanitizeTags(payload.tags);
  }
  if ("note" in payload) {
    updates.note = sanitizeText(payload.note);
  }
  if ("rules" in payload) {
    const rulesPayload =
      payload.rules && typeof payload.rules === "object" ? payload.rules : {};
    updates.rules = normalizeRules({
      ...rulesPayload,
      expectedStatusCodes:
        "expectedStatusCodes" in (rulesPayload as Record<string, unknown>)
          ? sanitizeStatusCodes(
              (rulesPayload as Record<string, unknown>).expectedStatusCodes
            )
          : undefined,
      maintenanceUntil:
        "maintenanceUntil" in (rulesPayload as Record<string, unknown>)
          ? sanitizeIsoDate(
              (rulesPayload as Record<string, unknown>).maintenanceUntil
            )
          : undefined,
    });
  }

  const updatedSite = await updateSite(id, updates);

  if (!updatedSite) {
    return NextResponse.json({ error: "Site bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(updatedSite);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id parametresi zorunlu" },
      { status: 400 }
    );
  }

  const removed = await removeSite(id);
  if (!removed) {
    return NextResponse.json({ error: "Site bulunamadı" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
