import { NextRequest, NextResponse } from "next/server";
import { getSites, addSite, removeSite } from "@/lib/store";

export async function GET() {
  const sites = await getSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!url || !name) {
    return NextResponse.json(
      { error: "url ve name alanları zorunlu" },
      { status: 400 }
    );
  }

  let normalizedUrl: string;

  // URL formatini kontrol et
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

  const site = await addSite(normalizedUrl, name);
  return NextResponse.json(site, { status: 201 });
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
