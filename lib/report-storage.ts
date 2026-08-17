export type SavedReport = {
  id: string;
  savedAt: string;
  query: string;
  reportType: string;
  period: string;
  sources: string[];
  templateFilename?: string;
  openai: unknown;
  gemini: unknown;
};

const STORAGE_KEY = "issue-brief-saved-reports";

export function saveReport(report: Omit<SavedReport, "id" | "savedAt">): SavedReport {
  const savedReport: SavedReport = {
    ...report,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  const reports = loadReports();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([savedReport, ...reports].slice(0, 20)));
  return savedReport;
}

export function loadReports(): SavedReport[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value as SavedReport[] : [];
  } catch {
    return [];
  }
}
