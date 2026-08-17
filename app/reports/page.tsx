"use client";

import { useEffect, useState } from "react";
import type { SavedReport } from "../../lib/report-storage";

type ProviderResult = { status?: string; text?: string; error?: string; sources?: Array<{ title?: string; url?: string }> };

function ResultBlock({ label, value }: { label: string; value: unknown }) {
  const result = value as ProviderResult | null;
  if (!result) return null;
  return <section className="saved-provider"><div className="saved-provider-heading"><strong>{label}</strong><span>{result.status === "success" ? "검색 완료" : "오류"}</span></div>{result.text && <p>{result.text}</p>}{result.error && <p className="save-error">{result.error}</p>}{result.sources && result.sources.length > 0 && <ol>{result.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a></li>)}</ol>}</section>;
}

export default function SavedReportsPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void fetch("/api/reports").then(async (response) => {
      const data = await response.json() as { reports?: SavedReport[]; error?: string };
      if (!response.ok) throw new Error(data.error || "저장 보고서를 불러오지 못했습니다.");
      return data.reports || [];
    }).then((storedReports) => {
      setReports(storedReports);
      setSelectedId(storedReports[0]?.id || null);
    }).catch((error: unknown) => {
      setReports([]);
      setSelectedId(null);
      setLoadError(error instanceof Error ? error.message : "저장 보고서를 불러오지 못했습니다.");
    });
  }, []);

  const selected = reports.find((report) => report.id === selectedId) || null;

  return <main className="saved-reports-page">
    <header className="saved-reports-header"><div><span className="step-label">ARCHIVE</span><h1>저장 보고서</h1><p>이 브라우저에 저장된 보고서 초안입니다.</p></div><button type="button" className="secondary-button" onClick={() => window.close()}>창 닫기</button></header>
    {reports.length === 0 ? <section className="saved-empty panel"><h2>{loadError ? "Supabase 연결을 확인해 주세요." : "저장된 보고서가 없습니다."}</h2><p>{loadError || "생성 결과 화면에서 보고서 저장 버튼을 눌러주세요."}</p><a className="saved-reports-link" href="/">새 보고서 만들기</a></section> : <div className="saved-reports-grid"><aside className="saved-list panel"><strong>저장 목록 ({reports.length})</strong>{reports.map((report) => <button type="button" key={report.id} className={report.id === selectedId ? "saved-list-item selected" : "saved-list-item"} onClick={() => setSelectedId(report.id)}><span>{report.query || "제목 없는 보고서"}</span><small>{new Date(report.savedAt).toLocaleString("ko-KR")}</small></button>)}</aside><article className="saved-detail panel">{selected && <><div className="saved-detail-meta"><span>{selected.reportType === "one-page" ? "보고용 1장 페이퍼" : "현황 · 문제점 · 대응방향"}</span><span>{new Date(selected.savedAt).toLocaleString("ko-KR")}</span></div><h2>{selected.query || "제목 없는 보고서"}</h2><p className="saved-condition">검색 기간: {selected.period} · 출처: {selected.sources.join(", ") || "없음"}{selected.templateFilename ? ` · 양식: ${selected.templateFilename}` : ""}</p><ResultBlock label="OpenAI · Web Search" value={selected.openai} /><ResultBlock label="Gemini · Google Search Grounding" value={selected.gemini} /></>}</article></div>}
  </main>;
}
