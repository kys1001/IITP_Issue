# 현안 브리프

키워드·뉴스 본문과 최신 웹 검색을 바탕으로 이슈 대응 및 성과 보고서 초안을 만드는 웹 도구입니다.

## 주요 기능

- OpenAI Responses API Web Search와 Gemini Google Search Grounding 연동
- OpenAI·Gemini API 결과 및 참고 출처 분리 표시
- HWP/HWPX, DOCX, PDF, XLS/XLSX 문서 양식 분석
- 분석된 양식의 제목·항목·문단 순서를 보고서 생성 프롬프트에 반영
- API 키는 브라우저 세션에만 저장

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3001/`을 엽니다.

## 빌드

```bash
npm run build
```

## API 키 보안

API 키는 웹 화면에서 입력하며 현재 브라우저 탭의 `sessionStorage`에만 저장됩니다. 실제 키를 `.env`나 소스 코드에 기록하거나 커밋하지 마세요. `.env.example`은 설정 참고용 빈 템플릿입니다.

## 문서 분석

문서 분석은 Node.js Route Handler `/api/template`에서 `kordoc`으로 처리합니다. 업로드된 양식은 Markdown과 구조 정보로 변환되어 보고서 생성 요청에 포함됩니다.
