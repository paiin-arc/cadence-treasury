/**
 * Combined entrypoint for Render / Production deployment.
 * Runs both the Hono REST API server and the background scheduler agent.
 */

import "./api/server.js";
import "./scheduler/index.js";
