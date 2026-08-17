import { NextResponse } from "next/server";
import { createRequire } from "node:module";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["hwp", "hwpx", "docx", "pdf", "xlsx", "xls"]);

const nodeRequire = createRequire(import.meta.url);
const loadNodeModule = nodeRequire.bind(null) as (name: string) => unknown;
const kordocModule = loadNodeModule("kordoc") as typeof import("kordoc");

function extensionOf(filename: string): string {
  return filename.toLowerCase().split(".").pop() || "";
}

function summarizeStructure(markdown: string, blocks: Array<{ type?: string; text?: string; level?: number }> = []) {
  const headings = blocks.filter((block) => block.type === "heading" || /^#{1,6}\s/.test(block.text || "")).map((block) => ({ level: block.level || 1, text: (block.text || "").replace(/^#+\s*/, "").trim() })).filter((heading) => heading.text).slice(0, 80);
  const tables = blocks.filter((block) => block.type === "table").length;
  const paragraphs = blocks.filter((block) => block.type === "paragraph").length;
  return {
    headings,
    tables,
    paragraphs,
    markdownPreview: markdown.slice(0, 12000),
    instruction: "원본의 제목·항목·문단 순서와 표의 열 구조를 가능한 한 유지하세요.",
  };
}

export async function POST(request: Request) {
  let formData: FormData;
  try { formData = await request.formData(); } catch { return NextResponse.json({ error: "업로드 요청을 읽을 수 없습니다." }, { status: 400 }); }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "분석할 파일을 선택해 주세요." }, { status: 400 });
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) return NextResponse.json({ filename: file.name, error: `지원하지 않는 파일 형식입니다: .${extension || "알 수 없음"}`, supported: [...SUPPORTED_EXTENSIONS] }, { status: 415 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ filename: file.name, error: "파일 크기는 30MB 이하만 업로드할 수 있습니다." }, { status: 413 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await kordocModule.parse(buffer);
    if (!parsed.success) return NextResponse.json({ filename: file.name, error: parsed.error || "문서 분석에 실패했습니다.", code: parsed.code, fileType: parsed.fileType }, { status: 422 });
    return NextResponse.json({
      filename: file.name,
      status: "analyzed",
      fileType: parsed.fileType,
      metadata: parsed.metadata || {},
      warnings: parsed.warnings || [],
      markdown: parsed.markdown,
      structure: summarizeStructure(parsed.markdown, parsed.blocks),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 분석 오류";
    return NextResponse.json({ filename: file.name, error: `${file.name} 분석 중 오류가 발생했습니다: ${message.slice(0, 300)}`, code: "PARSE_ERROR" }, { status: 422 });
  }
}
