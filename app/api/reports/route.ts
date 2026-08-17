import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportPayload = {
  query?: string;
  reportType?: string;
  period?: string;
  sources?: string[];
  templateFilename?: string;
  openai?: unknown;
  gemini?: unknown;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "알 수 없는 오류";
  if (/relation .*reports|does not exist|schema cache/i.test(message)) return "Supabase에 reports 테이블이 없습니다. supabase/reports.sql을 SQL Editor에서 실행해 주세요.";
  if (/row-level security|permission denied|not authorized/i.test(message)) return "Supabase reports 테이블 권한이 없습니다. supabase/reports.sql의 RLS 정책을 확인해 주세요.";
  if (/환경변수/.test(message)) return message;
  return `Supabase 저장에 실패했습니다: ${message.slice(0, 240)}`;
}

function toReport(row: Record<string, unknown>) {
  return {
    id: row.id,
    savedAt: row.saved_at,
    query: row.query || "",
    reportType: row.report_type,
    period: row.period,
    sources: Array.isArray(row.sources) ? row.sources : [],
    templateFilename: row.template_filename || undefined,
    openai: row.openai,
    gemini: row.gemini,
  };
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseServerClient().from("reports").select("*").order("saved_at", { ascending: false }).limit(20);
    if (error) return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
    return NextResponse.json({ reports: (data || []).map((row) => toReport(row as Record<string, unknown>)) });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ReportPayload;
    if (!payload.reportType || !payload.period) return NextResponse.json({ error: "보고서 유형과 검색 기간이 필요합니다." }, { status: 400 });
    const { data, error } = await getSupabaseServerClient().from("reports").insert({
      query: (payload.query || "").slice(0, 5000),
      report_type: payload.reportType,
      period: payload.period,
      sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 20) : [],
      template_filename: payload.templateFilename?.slice(0, 255) || null,
      openai: payload.openai || null,
      gemini: payload.gemini || null,
    }).select("*").single();
    if (error) return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
    return NextResponse.json({ report: toReport(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  }
}
