import { handle } from 'hono/vercel';

import {
  createMcpHandler,
  type CreateMcpHandlerOptions,
} from '../src/server.js';

export function createVercelHandler(options: CreateMcpHandlerOptions = {}) {
  return handle(createMcpHandler(options));
}

export default createVercelHandler();
