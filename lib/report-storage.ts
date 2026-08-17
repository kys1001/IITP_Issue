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
