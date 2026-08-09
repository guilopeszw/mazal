import { handle } from 'hono/vercel';

import {
  createMcpHandler,
  type CreateMcpHandlerOptions,
} from './server.js';

export function createVercelHandler(options: CreateMcpHandlerOptions = {}) {
  return handle(createMcpHandler(options, '/api/mcp.mjs'));
}

const deployedHandler = createVercelHandler();

export function GET(request: Request) {
  return deployedHandler(request);
}

export function POST(request: Request) {
  return deployedHandler(request);
}

export function DELETE(request: Request) {
  return deployedHandler(request);
}
