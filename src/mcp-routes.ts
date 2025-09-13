import { Router } from 'express';
import { db } from './database';
import { hashApiKey } from './utils';
import {
  MCPServer,
  ToolPricing,
  MCPCreditValidationRequest,
  MCPCreditValidationResponse,
  CreateMCPServerRequest,
  UpdateMCPServerRequest,
  SetToolPricingRequest,
  UsageLogRequest
} from './types';
import winston from 'winston';

const router = Router();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// MCP Credit validation and server lookup
router.post('/credit/validate/mcp', async (req, res): Promise<any> => {
  try {
    const { user_id, server_id, tool_name }: MCPCreditValidationRequest = req.body;

    if (!user_id || !server_id || !tool_name) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['user_id', 'server_id', 'tool_name']
      });
    }

    // Get MCP server details
    const serverResult = await db.query(
      `SELECT ms.*, u.email as provider_email
       FROM mcp_servers ms
       JOIN users u ON ms.provider_id = u.id
       WHERE ms.server_id = $1 AND ms.published = true`,
      [server_id]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        error: 'MCP server not found',
        server_id,
        hint: 'Check available servers at /api/mcp/servers'
      });
    }

    const server = serverResult.rows[0] as MCPServer;

    // Get tool pricing
    const pricingResult = await db.query(
      `SELECT * FROM tool_pricing
       WHERE server_id = $1 AND tool_name = $2`,
      [server.id, tool_name]
    );

    if (pricingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Tool not found for this server',
        server_id,
        tool_name,
        hint: `Check available tools at /api/mcp/server/${server_id}`
      });
    }

    const toolPricing = pricingResult.rows[0] as ToolPricing;

    // Check user credits
    const userResult = await db.query(
      'SELECT credits FROM users WHERE id = $1 AND status = $2',
      [user_id, 'active']
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check daily free usage
    let freeRequestsRemaining = 0;
    let isFreeRequest = false;

    if (server.free_requests_per_day > 0) {
      const today = new Date().toISOString().split('T')[0];
      const freeUsageResult = await db.query(
        `SELECT usage_count FROM daily_free_usage
         WHERE user_id = $1 AND server_id = $2 AND date = $3`,
        [user_id, server.id, today]
      );

      const currentUsage = freeUsageResult.rows.length > 0 ? freeUsageResult.rows[0].usage_count : 0;
      freeRequestsRemaining = Math.max(0, server.free_requests_per_day - currentUsage);
      isFreeRequest = freeRequestsRemaining > 0;
    }

    // Check if user has enough credits (if not free request)
    if (!isFreeRequest && user.credits < toolPricing.cost_per_call) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: toolPricing.cost_per_call,
        available: user.credits,
        free_requests_remaining: freeRequestsRemaining
      });
    }

    const response: MCPCreditValidationResponse = {
      valid: true,
      server_uuid: server.id,
      server_id: server.server_id,
      https_url: server.https_url,
      auth_type: server.auth_type,
      auth_config: server.auth_config,
      cost: isFreeRequest ? 0 : toolPricing.cost_per_call,
      free_requests_remaining: freeRequestsRemaining,
      is_free_request: isFreeRequest
    };

    res.json(response);
  } catch (error) {
    logger.error('MCP credit validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced usage logging for MCP
router.post('/usage/log/mcp', async (req, res): Promise<any> => {
  try {
    const {
      user_id,
      server_id,
      tool_name,
      request_id,
      status,
      response_status,
      latency_ms,
      is_upstream_error = false
    }: UsageLogRequest & { server_id: string; tool_name: string } = req.body;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Get server and tool pricing details
      const serverResult = await client.query(
        `SELECT ms.*, tp.cost_per_call
         FROM mcp_servers ms
         JOIN tool_pricing tp ON ms.id = tp.server_id
         WHERE ms.id = $1 AND tp.tool_name = $2`,
        [server_id, tool_name]
      );

      if (serverResult.rows.length === 0) {
        throw new Error('MCP server or tool not found');
      }

      const { cost_per_call, free_requests_per_day } = serverResult.rows[0];

      // Check if this should be a free request
      const today = new Date().toISOString().split('T')[0];
      let isFreeRequest = false;
      let actualCost = cost_per_call;

      if (free_requests_per_day > 0 && status === 'success') {
        // Get or create daily usage record
        const freeUsageResult = await client.query(
          `INSERT INTO daily_free_usage (user_id, server_id, date, usage_count)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (user_id, server_id, date)
           DO UPDATE SET usage_count = daily_free_usage.usage_count
           RETURNING usage_count`,
          [user_id, server_id, today]
        );

        const currentUsage = freeUsageResult.rows[0].usage_count;
        if (currentUsage < free_requests_per_day) {
          isFreeRequest = true;
          actualCost = 0;

          // Increment free usage count
          await client.query(
            `UPDATE daily_free_usage
             SET usage_count = usage_count + 1
             WHERE user_id = $1 AND server_id = $2 AND date = $3`,
            [user_id, server_id, today]
          );
        }
      }

      // Only deduct credits for successful paid requests
      if (status === 'success' && !isFreeRequest) {
        await client.query(
          'UPDATE users SET credits = credits - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [actualCost, user_id]
        );
      }

      // Log usage
      await client.query(
        `INSERT INTO usage_logs
         (user_id, server_id, tool_name, request_id, credits_used, status, response_status, latency_ms, gateway_type, is_upstream_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'mcp', $9)`,
        [user_id, server_id, tool_name, request_id, actualCost, status, response_status, latency_ms, is_upstream_error]
      );

      await client.query('COMMIT');

      logger.info('MCP API call logged', {
        user_id,
        server_id,
        tool_name,
        credits_used: actualCost,
        latency_ms,
        status,
        is_free_request: isFreeRequest
      });

      res.json({
        success: true,
        credits_deducted: actualCost,
        is_free_request: isFreeRequest
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('MCP usage logging error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List available MCP servers
router.get('/servers', async (req, res): Promise<any> => {
  try {
    const result = await db.query(
      `SELECT ms.server_id, ms.name, ms.description, ms.free_requests_per_day, ms.auth_type,
              COUNT(tp.id) as tool_count
       FROM mcp_servers ms
       LEFT JOIN tool_pricing tp ON ms.id = tp.server_id
       WHERE ms.published = true
       GROUP BY ms.id, ms.server_id, ms.name, ms.description, ms.free_requests_per_day, ms.auth_type
       ORDER BY ms.created_at DESC`
    );

    res.json({
      servers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('List MCP servers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific MCP server details and tools
router.get('/server/:serverId', async (req, res): Promise<any> => {
  try {
    const { serverId } = req.params;

    const serverResult = await db.query(
      `SELECT ms.server_id, ms.name, ms.description, ms.free_requests_per_day, ms.auth_type
       FROM mcp_servers ms
       WHERE ms.server_id = $1 AND ms.published = true`,
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        error: 'MCP server not found',
        server_id: serverId
      });
    }

    const server = serverResult.rows[0];

    // Get available tools and pricing
    const toolsResult = await db.query(
      `SELECT tp.tool_name, tp.cost_per_call, tp.description
       FROM tool_pricing tp
       JOIN mcp_servers ms ON tp.server_id = ms.id
       WHERE ms.server_id = $1
       ORDER BY tp.tool_name`,
      [serverId]
    );

    res.json({
      ...server,
      tools: toolsResult.rows
    });
  } catch (error) {
    logger.error('Get MCP server details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Register new MCP server
router.post('/admin/servers', async (req, res): Promise<any> => {
  try {
    const {
      server_id,
      https_url,
      name,
      description = '',
      published = false,
      free_requests_per_day = 0,
      auth_type = 'bearer',
      auth_config = {}
    }: CreateMCPServerRequest = req.body;

    // For now, use the first user as provider - in production, get from auth
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    const provider_id = userResult.rows[0].id;

    const result = await db.query(
      `INSERT INTO mcp_servers (provider_id, server_id, https_url, name, description, published, free_requests_per_day, auth_type, auth_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [provider_id, server_id, https_url, name, description, published, free_requests_per_day, auth_type, auth_config]
    );

    res.status(201).json({
      success: true,
      server: result.rows[0]
    });
  } catch (error) {
    if ((error as any).code === '23505') { // Unique constraint violation
      return res.status(409).json({
        error: 'MCP server with this server_id already exists'
      });
    }
    logger.error('Register MCP server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Update MCP server
router.put('/admin/servers/:id', async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    const updates: UpdateMCPServerRequest = req.body;

    const setParts: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        setParts.push(`${key} = $${valueIndex}`);
        values.push(value);
        valueIndex++;
      }
    });

    if (setParts.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE mcp_servers SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${valueIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    res.json({
      success: true,
      server: result.rows[0]
    });
  } catch (error) {
    logger.error('Update MCP server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Set tool pricing
router.post('/admin/servers/:id/pricing', async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    const { tool_name, cost_per_call, description }: SetToolPricingRequest = req.body;

    const result = await db.query(
      `INSERT INTO tool_pricing (server_id, tool_name, cost_per_call, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (server_id, tool_name)
       DO UPDATE SET cost_per_call = EXCLUDED.cost_per_call, description = EXCLUDED.description
       RETURNING *`,
      [id, tool_name, cost_per_call, description || null]
    );

    res.json({
      success: true,
      pricing: result.rows[0]
    });
  } catch (error) {
    logger.error('Set tool pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;