import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_TIMEOUT_MS = 35_000;
const GEMINI_TIMEOUT_MS = 120_000;
const MAX_SOURCES = 20;
const OPENAI_MODEL = "gpt-4.1-mini";
const GEMINI_MODEL = "gemini-2.5-flash";

type Provider = "openai" | "gemini";
type Source = { title: string; url: string; key: string };
type SearchPayload = { query?: string; reportType?: string; period?: string; periodLabel?: string; sources?: string[]; openaiKey?: string; geminiKey?: string; templateMarkdown?: string; templateFilename?: string };

const SOURCE_DOMAINS: Record<string, string[]> = {
  "정부·공공기관": ["go.kr", "korea.kr", "data.go.kr", "gov.kr"],
  "연구·학술": ["kci.go.kr", "riss.kr", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "nature.com", "sciencedirect.com"],
  뉴스: ["yna.co.kr", "khan.co.kr", "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "mk.co.kr", "reuters.com", "bbc.com"],
  기업: ["dart.fss.or.kr", "hankyung.com", "sedaily.com", "businesswire.com", "prnewswire.com"],
  국제기구: ["oecd.org", "un.org", "imf.org", "worldbank.org", "who.int"],
};

function cleanUrl(value: unknown): Source | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].forEach((key) => { if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key); });
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return { title: "참고 출처", url: url.toString(), key: `${url.protocol}//${url.host}${url.pathname}${url.search}`.toLowerCase() };
  } catch { return null; }
}

function dedupeSources(items: Source[]): Source[] { const seen = new Set<string>(); return items.filter((item) => !seen.has(item.key) && seen.add(item.key)).slice(0, MAX_SOURCES); }

function buildPrompt(payload: SearchPayload): string {
  const reportType = payload.reportType === "issue-response" ? "현황-문제점-대응방향" : "보고용 1장 페이퍼";
  const templateInstruction = payload.templateMarkdown?.trim() ? `

The uploaded report template (${payload.templateFilename || "original document"}) was analyzed. Preserve its title hierarchy, item order, paragraph order, and table structure as much as possible. Use it only as a structure/template, not as verified facts.
--- analyzed template ---
${payload.templateMarkdown.slice(0, 24000)}
--- end analyzed template ---` : "";
  return `You are a Korean public-policy issue analyst. Use real-time web search to verify the issue and write a Korean report draft.

Issue input:
${payload.query?.trim() || "지역 소멸 대응과 청년 정착 지원"}

Report type: ${reportType}
Search period: ${payload.periodLabel || payload.period || "최근 30일"}. Prioritize this period and disclose when older sources are used.
Preferred source categories: ${(payload.sources || []).join(", ") || "none"}. Prefer sources from these categories.

Required output headings in this order: 제목, 핵심 요약, 현황, 문제점, 대응방향, 효과성, 시사점, 참고 출처.
Put [1], [2] style citation markers after evidence-based sentences. Include a final 참고 출처 list with source titles and links. Never invent facts or sources.${templateInstruction}`;
}

function withInlineCitations(text: string, citations: Array<{ end?: number; sourceIndex: number }>): string {
  let output = text || "검색 결과가 비어 있습니다.";
  for (const citation of citations.filter((item) => typeof item.end === "number").sort((a, b) => (b.end || 0) - (a.end || 0))) output = `${output.slice(0, citation.end as number)} [${citation.sourceIndex}]${output.slice(citation.end as number)}`;
  return output;
}

function errorMessage(provider: Provider, status: number, body: string): string {
  const name = provider === "openai" ? "OpenAI" : "Gemini";
  if (status === 401 || status === 403) return `${name} API 키가 유효하지 않거나 권한이 없습니다.`;
  if (status === 429) return `${name} API 사용량 한도에 도달했습니다.`;
  if (status >= 500) return `${name} 서버에서 일시적인 오류가 발생했습니다.`;
  try { const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string }; const message = parsed.error?.message || parsed.message; if (message) return `${name}: ${message.slice(0, 220)}`; } catch { /* generic */ }
  return `${name} 검색 요청에 실패했습니다. (HTTP ${status})`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); }
}

async function callOpenAI(payload: SearchPayload): Promise<{ text: string; sources: Source[] }> {
  const allowedDomains = [...new Set((payload.sources || []).flatMap((source) => SOURCE_DOMAINS[source] || []))];
  const tool: Record<string, unknown> = { type: "web_search" };
  if (allowedDomains.length) tool.filters = { allowed_domains: allowedDomains };
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${payload.openaiKey}` }, body: JSON.stringify({ model: OPENAI_MODEL, tools: [tool], input: buildPrompt(payload) }) }, OPENAI_TIMEOUT_MS);
  const body = await response.text();
  if (!response.ok) throw new Error(errorMessage("openai", response.status, body));
  const data = JSON.parse(body) as { output_text?: string; output?: Array<{ content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string; end_index?: number }> }> }> };
  const annotations = (data.output || []).flatMap((item) => item.content || []).flatMap((content) => (content.annotations || []).filter((annotation) => annotation.type === "url_citation"));
  const sources: Source[] = []; const sourceMap = new Map<string, number>();
  const citations = annotations.flatMap((annotation) => { const source = cleanUrl(annotation.url); if (!source) return []; if (!sourceMap.has(source.key)) { sources.push({ ...source, title: annotation.title || source.title }); sourceMap.set(source.key, sources.length); } return [{ end: annotation.end_index, sourceIndex: sourceMap.get(source.key) as number }]; });
  return { text: withInlineCitations(data.output_text || "", citations), sources: dedupeSources(sources) };
}

async function callGemini(payload: SearchPayload): Promise<{ text: string; sources: Source[] }> {
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": payload.geminiKey || "" }, body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(payload) }] }], tools: [{ google_search: {} }] }) }, GEMINI_TIMEOUT_MS);
  const body = await response.text();
  if (!response.ok) throw new Error(errorMessage("gemini", response.status, body));
  const data = JSON.parse(body) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>; groundingSupports?: Array<{ segment?: { endIndex?: number }; groundingChunkIndices?: number[] }> } }> };
  const candidate = data.candidates?.[0]; const text = candidate?.content?.parts?.map((part) => part.text || "").join("") || "검색 결과가 비어 있습니다."; const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const sources: Source[] = []; const sourceMap = new Map<string, number>();
  chunks.forEach((chunk) => { const source = cleanUrl(chunk.web?.uri); if (source && !sourceMap.has(source.key)) { sources.push({ ...source, title: chunk.web?.title || source.title }); sourceMap.set(source.key, sources.length); } });
  const citations = (candidate?.groundingMetadata?.groundingSupports || []).flatMap((support) => (support.groundingChunkIndices || []).map((index) => { const source = cleanUrl(chunks[index]?.web?.uri); return source && sourceMap.has(source.key) ? { end: support.segment?.endIndex, sourceIndex: sourceMap.get(source.key) as number } : null; }).filter((item): item is { end?: number; sourceIndex: number } => item !== null));
  return { text: withInlineCitations(text, citations), sources: dedupeSources(sources) };
}

export async function POST(request: Request) {
  let payload: SearchPayload;
  try { payload = await request.json() as SearchPayload; } catch { return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 }); }
  const hasOpenAI = Boolean(payload.openaiKey?.trim()); const hasGemini = Boolean(payload.geminiKey?.trim());
  if (!hasOpenAI && !hasGemini) return NextResponse.json({ error: "OpenAI 또는 Gemini API 키를 입력해 주세요." }, { status: 400 });
  const [openai, gemini] = await Promise.all([
    hasOpenAI ? callOpenAI(payload).then((data) => ({ status: "success" as const, ...data })).catch((error: unknown) => ({ status: "error" as const, error: error instanceof Error && error.name === "AbortError" ? "OpenAI 요청 시간이 초과되었습니다." : error instanceof Error ? error.message : "OpenAI 검색에 실패했습니다." })) : Promise.resolve(null),
    hasGemini ? callGemini(payload).then((data) => ({ status: "success" as const, ...data })).catch((error: unknown) => ({ status: "error" as const, error: error instanceof Error && error.name === "AbortError" ? "Gemini 요청 시간이 초과되었습니다. 검색 범위를 줄이거나 잠시 후 다시 시도해 주세요." : error instanceof Error ? error.message : "Gemini 검색에 실패했습니다." })) : Promise.resolve(null),
  ]);
  return NextResponse.json({ openai, gemini });
}
