import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { getUiCapability } from "@modelcontextprotocol/ext-apps/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { isInitializeRequest, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 캐시 우회를 위해 버전된 widget URI 사용
const tableauWidgetUri = "ui://widget/tableau-widget-v2.html";

async function loadViewsConfig() {
  const configPath = join(__dirname, "tableau-views.json");
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    default: {
      title: String(parsed?.default?.title ?? "Tableau 차트"),
      url: String(parsed?.default?.url ?? "")
    },
    rules: Array.isArray(parsed?.rules) ? parsed.rules : []
  };
}

function pickView({ question, config }) {
  const q = (question ?? "").toLowerCase();
  for (const rule of config.rules) {
    const keywords = Array.isArray(rule?.keywords) ? rule.keywords : [];
    const matched = keywords.some((k) => String(k).toLowerCase() && q.includes(String(k).toLowerCase()));
    if (!matched) continue;
    return {
      title: String(rule?.title ?? config.default.title),
      url: String(rule?.url ?? config.default.url)
    };
  }
  return config.default;
}

const getServer = () => {
  const server = new McpServer({ name: "tableau-gpt-bridge", version: "0.1.0" });

  server.server.oninitialized = () => {
    const caps = server.server.getClientCapabilities();
    const uiCap = getUiCapability(caps);
    console.log("[client] capabilities", {
      hasCapabilities: Boolean(caps),
      extensions: caps?.extensions ? Object.keys(caps.extensions) : [],
      uiCap,
      uiMimeTypes: uiCap?.mimeTypes ?? []
    });
  };

  registerAppResource(server, "tableau-widget", tableauWidgetUri, {}, async () => {
    console.log("[resource] read", { uri: tableauWidgetUri });
    const html = await readFile(join(__dirname, "widget-v2.html"), "utf8");
    return {
      contents: [
        {
          uri: tableauWidgetUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: true,
              // iframe 내 Tableau Public 임베드를 허용
              csp: {
                frameDomains: ["https://public.tableau.com", "https://*.tableau.com"],
                connectDomains: ["https://public.tableau.com", "https://*.tableau.com"],
                resourceDomains: ["https://public.tableau.com", "https://*.tableau.com"]
              }
            }
          }
        }
      ]
    };
  });

  registerAppTool(
    server,
    "resolve_tableau_view",
    {
      title: "질문에 맞는 Tableau 뷰 찾기",
      description: "사용자 질문을 바탕으로 표시할 Tableau Public 뷰 URL을 결정합니다.",
      inputSchema: z.object({
        question: z.string().optional().describe("사용자 질문(키워드 기반 매핑)")
      }),
      // 호스트별 구현 차이로 nested/flat meta 모두 제공
      _meta: { ui: { resourceUri: tableauWidgetUri }, "ui/resourceUri": tableauWidgetUri }
    },
    async ({ question }) => {
      const config = await loadViewsConfig();
      const envDefaultUrl = process.env.TABLEAU_DEFAULT_URL?.trim();
      if (envDefaultUrl) config.default.url = envDefaultUrl;

      const selected = pickView({ question, config });
      return {
        content: [
          {
            type: "text",
            text: selected.url
              ? `요청에 맞는 Tableau 뷰를 선택했습니다: ${selected.title}`
              : "Tableau 뷰 URL이 설정되어 있지 않습니다. tableau-views.json 또는 TABLEAU_DEFAULT_URL을 확인해주세요."
          }
        ],
        structuredContent: {
          title: selected.title,
          tableauUrl: selected.url,
          question: question ?? ""
        },
        // 호스트별 구현 차이로 nested/flat meta 모두 제공
        _meta: { ui: { resourceUri: tableauWidgetUri }, "ui/resourceUri": tableauWidgetUri }
      };
    }
  );

  registerAppTool(
    server,
    "show_tableau_chart",
    {
      title: "Tableau 차트 보기",
      description: "선택된 Tableau Public 차트를 ChatGPT 앱 UI에 표시합니다.",
      inputSchema: z.object({
        question: z.string().optional().describe("사용자 질문")
      }),
      // 호스트별 구현 차이로 nested/flat meta 모두 제공
      _meta: { ui: { resourceUri: tableauWidgetUri }, "ui/resourceUri": tableauWidgetUri }
    },
    async ({ question }) => {
      const config = await loadViewsConfig();
      const envDefaultUrl = process.env.TABLEAU_DEFAULT_URL?.trim();
      if (envDefaultUrl) config.default.url = envDefaultUrl;

      const selected = pickView({ question, config });
      console.log("[show_tableau_chart] selected", {
        title: selected.title,
        tableauUrl: selected.url,
        question: question ?? ""
      });
      return {
        content: [
          {
            type: "text",
            text: question ? `요청하신 Tableau 차트를 표시합니다. 질문: ${question}` : "Tableau Public 차트를 표시합니다."
          }
        ],
        structuredContent: {
          title: selected.title,
          tableauUrl: selected.url,
          question: question ?? ""
        },
        // 호스트별 구현 차이로 nested/flat meta 모두 제공
        _meta: { ui: { resourceUri: tableauWidgetUri }, "ui/resourceUri": tableauWidgetUri }
      };
    }
  );

  return server;
};

const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Railway 같은 외부 배포 환경에서는 Host 헤더가 배포 도메인으로 들어오므로
// (기본 localhost 보호 정책을 쓰면 403이 날 수 있음) 명시적으로 허용 호스트를 설정합니다.
const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: allowedHosts.length ? allowedHosts : undefined
});
const transports = {};

app.post("/mcp", async (req, res) => {
  try {
    const method = req.body?.method;
    if (method === "resources/read" || method === "resources/list" || method === "tools/list" || method === "tools/call") {
      console.log("[mcp] request", {
        method,
        id: req.body?.id ?? null,
        uri: req.body?.params?.uri,
        name: req.body?.params?.name
      });
    }

    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        }
      });

      const server = getServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error instanceof Error ? error.message : "Internal server error" },
        id: null
      });
    }
  }
});

app.get("/mcp", async (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method Not Allowed");
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
  console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
});

