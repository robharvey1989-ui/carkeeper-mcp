import "dotenv/config";
import { createServer as createHttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  checkVehicle,
  analysePurchase,
  compareVehicles,
  startFullReportCheckout,
  getReport
} from "./carkeeper-client.js";

const registration = z.string().min(2).max(12).describe("UK vehicle registration, for example AB18 XYZ");
const mileage = z.number().int().nonnegative().max(1000000).optional();
const askingPrice = z.number().nonnegative().max(10000000).optional();
const advertText = z.string().max(20000).optional();
const advertUrl = z.string().url().max(2000).optional();
const imageUrls = z.array(z.string().url().max(2000)).max(4).optional();

function asToolResult(data, message) {
  return {
    structuredContent: data,
    content: [{ type: "text", text: message }]
  };
}

function asToolError(error) {
  console.error(error);
  return {
    isError: true,
    content: [{
      type: "text",
      text: "CarKeeper could not complete that check. Do not invent vehicle facts. Explain that the live vehicle check failed and ask the user to try again."
    }]
  };
}

function createCarKeeperServer() {
  const server = new McpServer(
    { name: "carkeeper", version: "0.1.0" },
    {
      instructions:
        "CarKeeper is a UK vehicle-buying assistant. Use its tools for vehicle-specific facts and purchase analysis. Never invent MOT, valuation, finance, write-off, stolen, mileage or vehicle-history facts. Distinguish live data from user-supplied claims. A CarKeeper result is decision support, not a mechanical inspection or legal guarantee."
    }
  );

  server.registerTool(
    "check_vehicle",
    {
      title: "Check a vehicle with CarKeeper",
      description: "Use this when the user wants factual information or risk signals about a specific UK vehicle registration.",
      inputSchema: { registration },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    async (args) => {
      try {
        const result = await checkVehicle(args);
        return asToolResult(result, `CarKeeper checked ${result.registration ?? args.registration}. Use the returned live fields exactly and do not fill missing fields from guesswork.`);
      } catch (error) {
        return asToolError(error);
      }
    }
  );

  server.registerTool(
    "analyse_purchase",
    {
      title: "Analyse a car purchase",
      description: "Use this when the user is considering buying a specific UK vehicle and wants CarKeeper's Buyer Score, price assessment, risks, seller questions and negotiation points.",
      inputSchema: { registration, mileage, askingPrice, advertText, advertUrl, imageUrls },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    async (args) => {
      try {
        const result = await analysePurchase(args);
        return asToolResult(result, `CarKeeper analysed the proposed purchase of ${args.registration}. Present the Buyer Score, recommendation, key concerns, value position and next actions clearly.`);
      } catch (error) {
        return asToolError(error);
      }
    }
  );

  server.registerTool(
    "compare_vehicles",
    {
      title: "Compare cars with CarKeeper",
      description: "Use this when the user is choosing between two or more specific UK vehicles and wants an evidence-based purchase comparison.",
      inputSchema: {
        vehicles: z.array(z.object({
          registration,
          mileage,
          askingPrice,
          advertText,
          advertUrl,
          imageUrls
        })).min(2).max(5)
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    async (args) => {
      try {
        const result = await compareVehicles(args);
        return asToolResult(result, "CarKeeper compared the vehicles. Explain why the recommended car ranks higher and surface any reason the user should still inspect or verify it.");
      } catch (error) {
        return asToolError(error);
      }
    }
  );

  if (String(process.env.CARKEEPER_ENABLE_COMMERCE_TOOLS ?? "false").toLowerCase() === "true") {
    server.registerTool(
      "start_full_report_checkout",
      {
        title: "Unlock a full CarKeeper report",
        description: "Use this only when the user wants to buy or unlock CarKeeper's full paid vehicle report for a specific vehicle. It creates a CarKeeper checkout link; it does not itself charge the user.",
        inputSchema: { registration, mileage, askingPrice, advertText, advertUrl, imageUrls },
        annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false, idempotentHint: false }
      },
      async (args) => {
        try {
          const result = await startFullReportCheckout(args);
          return asToolResult(result, "CarKeeper created a checkout link. Clearly state the price returned by CarKeeper and provide the checkout link; do not claim payment has completed.");
        } catch (error) {
          return asToolError(error);
        }
      }
    );

    server.registerTool(
      "get_report",
      {
        title: "Retrieve a CarKeeper report",
        description: "Use this when the user has a CarKeeper report ID and wants to check its status or retrieve the completed report link/summary.",
        inputSchema: { reportId: z.string().min(1).max(200) },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
      },
      async (args) => {
        try {
          const result = await getReport(args);
          return asToolResult(result, `CarKeeper looked up report ${args.reportId}. Only say it is complete if the returned status says so.`);
        } catch (error) {
          return asToolError(error);
        }
      }
    );
  }

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createHttpServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      service: "CarKeeper MCP",
      status: "ok",
      liveReportEngine: Boolean(process.env.CARKEEPER_PLUGIN_TOKEN),
      commerceToolsEnabled: String(process.env.CARKEEPER_ENABLE_COMMERCE_TOOLS ?? "false").toLowerCase() === "true"
    }));
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createCarKeeperServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`CarKeeper MCP listening on http://localhost:${port}${MCP_PATH}`);
  console.log(`Live report engine configured: ${Boolean(process.env.CARKEEPER_PLUGIN_TOKEN)}`);
  console.log(`Commerce tools enabled: ${String(process.env.CARKEEPER_ENABLE_COMMERCE_TOOLS ?? "false")}`);
});
