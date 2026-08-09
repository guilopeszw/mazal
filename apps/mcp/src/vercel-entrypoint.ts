import { handle } from 'hono/vercel';

import {
  createMcpHandler,
  type CreateMcpHandlerOptions,
} from './server.js';

export function createVercelHandler(options: CreateMcpHandlerOptions = {}) {
  return handle(createMcpHandler(options, '/api/mcp'));
}

export default createVercelHandler();
