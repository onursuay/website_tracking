import { NextRequest, NextResponse } from "next/server";
import { buildCsv } from "@/lib/site-utils";
import { getSites } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const sites = await getSites();

  if (format === "csv") {
    return new NextResponse(buildCsv(sites), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="website-tracking-export.csv"`,
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    totalSites: sites.length,
    sites,
  });
}
