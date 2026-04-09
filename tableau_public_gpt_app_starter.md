# Tableau Public GPT 앱 스타터

아래 2개 파일로 가장 작은 형태의 Apps SDK 앱을 시작할 수 있습니다.

## 파일 구조

```text
project/
├─ package.json
├─ server.js
└─ widget.html
```

## 1) package.json

```json
{
  "name": "tableau-public-gpt-app-starter",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "@openai/apps-sdk": "latest",
    "zod": "latest"
  }
}
```

## 2) server.js

```javascript
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { AppServer } from "@openai/apps-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new AppServer({
  name: "tableau-public-demo",
  version: "1.0.0"
});

const TABLEAU_URL =
  "https://public.tableau.com/views/1_17757134035930/1?:embed=y&:showVizHome=n";

app.tool(
  "show_tableau_chart",
  {
    title: "Tableau 차트 보기",
    description: "Tableau Public 차트를 ChatGPT 앱 UI에 표시합니다.",
    inputSchema: {
      question: z.string().optional().describe("사용자 질문")
    }
  },
  async ({ question }) => {
    return {
      content: [
        {
          type: "text",
          text:
            question
              ? `요청하신 차트를 표시합니다. 질문: ${question}`
              : "Tableau Public 차트를 표시합니다."
        }
      ],
      structuredContent: {
        title: "Category별 Sales",
        tableauUrl: TABLEAU_URL,
        question: question ?? ""
      },
      _meta: {
        "openai/outputTemplate": "ui://widget/tableau-widget.html"
      }
    };
  }
);

app.resource(
  "tableau-widget",
  "ui://widget/tableau-widget.html",
  {},
  async () => {
    const html = await readFile(join(__dirname, "widget.html"), "utf8");
    return {
      contents: [
        {
          uri: "ui://widget/tableau-widget.html",
          mimeType: "text/html",
          text: html
        }
      ]
    };
  }
);

const server = createServer(async (req, res) => {
  try {
    await app.handle(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "internal_server_error",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MCP app server listening on http://localhost:${PORT}`);
});
```

## 3) widget.html

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tableau Widget</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #fff;
      }
      .wrap {
        padding: 12px;
      }
      .title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .sub {
        font-size: 13px;
        color: #555;
        margin-bottom: 12px;
      }
      iframe {
        width: 100%;
        height: 720px;
        border: 0;
        border-radius: 10px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="title" id="title">Tableau 차트</div>
      <div class="sub" id="sub">차트를 불러오는 중...</div>
      <iframe id="viz" allowfullscreen></iframe>
    </div>

    <script>
      const payload = window.openai?.structuredContent ?? {};
      const title = payload.title || "Tableau 차트";
      const tableauUrl = payload.tableauUrl || "";
      const question = payload.question || "";

      document.getElementById("title").textContent = title;
      document.getElementById("sub").textContent = question
        ? `질문: ${question}`
        : "Tableau Public 차트가 표시됩니다.";
      document.getElementById("viz").src = tableauUrl;
    </script>
  </body>
</html>
```

## 실행

```bash
npm install
npm start
```

## ChatGPT에 연결할 때

로컬 서버를 외부에서 접근 가능하게 노출한 뒤, ChatGPT 개발자 모드에서 MCP 서버 URL을 연결합니다.

## 다음 확장 포인트

1. `show_tableau_chart` 대신 `resolve_tableau_view` 툴 추가
2. 질문별로 다른 Tableau URL 반환
3. 이후 Tableau Cloud 전환 시 Connected App + JWT 인증 적용

