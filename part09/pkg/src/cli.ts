#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, REPO } from "./server.js";

console.error(`repopilot-mcp ready, repo: ${REPO}`);
await buildServer().connect(new StdioServerTransport());
