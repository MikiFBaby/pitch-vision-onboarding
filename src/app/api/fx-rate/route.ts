import { NextResponse } from "next/server";
import { getCadToUsdRate } from "@/utils/fx";

export const runtime = "nodejs";

export async function GET() {
  const rate = await getCadToUsdRate();
  return NextResponse.json({ cad_to_usd: rate });
}
