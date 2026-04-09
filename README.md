# tableau-gpt-bridge

Tableau(우선 Tableau Public 임베드) 차트를 **ChatGPT 앱(Apps SDK + MCP 서버)**에서 보여주는 최소 프로젝트입니다.

## 구성

- `server.js`: Apps SDK 기반 MCP 앱 서버. 툴(`resolve_tableau_view`, `show_tableau_chart`) 제공
- `widget.html`: structuredContent를 받아 Tableau iframe을 렌더링하는 UI 템플릿
- `tableau-views.json`: 질문 키워드 → Tableau URL 매핑(간단 규칙 기반)

## 로컬 실행

```bash
npm install
npm start
```

기본 포트는 `3000` 입니다.

## Tableau URL 설정

### 1) `tableau-views.json`로 설정 (권장)

- `default.url`: 기본으로 보여줄 Tableau Public 뷰 URL
- `rules[]`: `keywords` 중 하나라도 질문에 포함되면 해당 `url` 선택

### 2) 환경변수로 기본 URL 덮어쓰기

`.env.example` 참고:

- `TABLEAU_DEFAULT_URL`: `tableau-views.json`의 `default.url`을 덮어씁니다.

## ChatGPT(개발자 모드) 연결 흐름

1. 로컬 서버(`http://localhost:3000`)를 외부에서 접근 가능하게 노출합니다. (예: ngrok, Cloudflare Tunnel 등)
2. ChatGPT 개발자 모드에서 **MCP 서버 URL**로 위 노출된 주소를 연결합니다.
3. 대화에서 아래 툴을 호출하도록 유도합니다.
   - `show_tableau_chart`: UI 위젯으로 차트 표시
   - `resolve_tableau_view`: 질문에 맞는 뷰를 선택(디버그/확인용)

## 다음 단계(확장 포인트)

- 질문을 LLM으로 분류/의도파악하여 `tableau-views.json` 룰을 더 정교하게 만들기
- Tableau Cloud로 전환 시: Connected App + JWT(또는 OAuth) 기반 인증 흐름 추가

