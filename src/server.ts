import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import winston from 'winston';
import { db, testConnection } from './database';
import { hashApiKey, decrypt } from './utils';
import {
  User,
  AuthResponse,
  CreditValidationRequest,
  CreditValidationResponse,
  UsageLogRequest
} from './types';
import mcpRoutes from './mcp-routes';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Mount MCP routes
app.use('/api/mcp', mcpRoutes);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'api-gateway.log' }),
    new winston.transports.Console()
  ]
});

// API Key validation for Zuplo policies
app.post('/auth/validate', async (req, res): Promise<any> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const result = await db.query(
      `SELECT u.*, ak.id as key_id
       FROM users u
       JOIN api_keys ak ON u.id = ak.user_id
       WHERE ak.key_hash = $1 AND ak.status = 'active' AND u.status = 'active'`,
      [hashApiKey(apiKey)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const user = result.rows[0] as User;

    const authResponse: AuthResponse = {
      valid: true,
      user_id: user.id,
      credits: user.credits,
      context: {
        userId: user.id,
        userEmail: user.email,
        credits: user.credits
      }
    };

    res.json(authResponse);
  } catch (error) {
    logger.error('Auth validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Credit validation and API lookup
app.post('/credit/validate', async (req, res): Promise<any> => {
  try {
    const { user_id, vendor, model }: CreditValidationRequest = req.body;

    const apiResult = await db.query(
      `SELECT a.*, v.name as vendor_name, v.base_url, v.api_key_encrypted, v.default_headers
       FROM apis a
       JOIN vendors v ON a.vendor_id = v.id
       WHERE LOWER(v.name) = LOWER($1) AND LOWER(a.name) = LOWER($2) AND a.is_active = true`,
      [vendor, model]
    );

    if (apiResult.rows.length === 0) {
      return res.status(404).json({
        error: 'API not found',
        available_apis: 'Please check available APIs: /api/v1/{openai|anthropic}/{gpt-4|gpt-3.5|claude-3}'
      });
    }

    const api = apiResult.rows[0];

    const userResult = await db.query(
      'SELECT credits FROM users WHERE id = $1 AND status = $2',
      [user_id, 'active']
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.credits < api.cost_per_call) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: api.cost_per_call,
        available: user.credits
      });
    }

    const response: CreditValidationResponse = {
      valid: true,
      api_id: api.id,
      cost: api.cost_per_call,
      vendor_url: api.base_url + api.endpoint,
      vendor_headers: JSON.parse(api.default_headers || '{}'),
      api_key: decrypt(api.api_key_encrypted, process.env.ENCRYPTION_KEY || 'default-key')
    };

    res.json(response);
  } catch (error) {
    logger.error('Credit validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced usage logging & credit deduction for both LLM and MCP
app.post('/usage/log', async (req, res): Promise<any> => {
  try {
    const {
      user_id,
      request_id,
      status,
      response_status,
      latency_ms,
      gateway_type = 'llm',
      api_id,
      server_id,
      tool_name,
      is_upstream_error = false
    }: UsageLogRequest = req.body;

    // Validate required fields based on gateway type
    if (gateway_type === 'llm' && !api_id) {
      return res.status(400).json({ error: 'api_id required for LLM gateway' });
    }
    if (gateway_type === 'mcp' && (!server_id || !tool_name)) {
      return res.status(400).json({ error: 'server_id and tool_name required for MCP gateway' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let cost = 0;

      if (gateway_type === 'llm') {
        // LLM Gateway logic (existing)
        const apiResult = await client.query(
          'SELECT cost_per_call FROM apis WHERE id = $1',
          [api_id]
        );

        if (apiResult.rows.length === 0) {
          throw new Error('LLM API not found');
        }

        cost = apiResult.rows[0].cost_per_call;
      } else if (gateway_type === 'mcp') {
        // MCP Gateway logic (new)
        const mcpResult = await client.query(
          `SELECT ms.free_requests_per_day, tp.cost_per_call
           FROM mcp_servers ms
           JOIN tool_pricing tp ON ms.id = tp.server_id
           WHERE ms.id = $1 AND tp.tool_name = $2`,
          [server_id, tool_name]
        );

        if (mcpResult.rows.length === 0) {
          throw new Error('MCP server or tool not found');
        }

        const { cost_per_call, free_requests_per_day } = mcpResult.rows[0];

        // Check if this should be a free request
        if (free_requests_per_day > 0 && status === 'success') {
          const today = new Date().toISOString().split('T')[0];
          const freeUsageResult = await client.query(
            `SELECT usage_count FROM daily_free_usage
             WHERE user_id = $1 AND server_id = $2 AND date = $3`,
            [user_id, server_id, today]
          );

          const currentUsage = freeUsageResult.rows.length > 0 ? freeUsageResult.rows[0].usage_count : 0;
          if (currentUsage < free_requests_per_day) {
            cost = 0; // Free request

            // Increment free usage count
            await client.query(
              `INSERT INTO daily_free_usage (user_id, server_id, date, usage_count)
               VALUES ($1, $2, $3, 1)
               ON CONFLICT (user_id, server_id, date)
               DO UPDATE SET usage_count = daily_free_usage.usage_count + 1`,
              [user_id, server_id, today]
            );
          } else {
            cost = cost_per_call;
          }
        } else {
          cost = cost_per_call;
        }
      }

      // Only deduct credits for successful requests
      if (status === 'success' && cost > 0) {
        await client.query(
          'UPDATE users SET credits = credits - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [cost, user_id]
        );
      }

      // Enhanced logging for both gateways
      await client.query(
        `INSERT INTO usage_logs
         (user_id, request_id, credits_used, status, response_status, latency_ms, gateway_type, api_id, server_id, tool_name, is_upstream_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [user_id, request_id, status === 'success' ? cost : 0, status, response_status, latency_ms, gateway_type, api_id || null, server_id || null, tool_name || null, is_upstream_error]
      );

      await client.query('COMMIT');

      logger.info(`${gateway_type.toUpperCase()} API call logged`, {
        user_id,
        gateway_type,
        ...(api_id && { api_id }),
        ...(server_id && { server_id }),
        ...(tool_name && { tool_name }),
        credits_used: status === 'success' ? cost : 0,
        latency_ms,
        status
      });

      res.json({
        success: true,
        credits_deducted: status === 'success' ? cost : 0,
        gateway_type
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Usage logging error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user credit balance
app.get('/user/:id/credits', async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT credits FROM users WHERE id = $1 AND status = $2',
      [id, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ credits: result.rows[0].credits });
  } catch (error) {
    logger.error('Get credits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Add credits (for MVP manual top-up)
app.post('/admin/user/:id/credits', async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const result = await db.query(
      'UPDATE users SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3 RETURNING credits',
      [amount, id, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('Credits added', { user_id: id, amount, new_balance: result.rows[0].credits });

    res.json({
      success: true,
      new_balance: result.rows[0].credits,
      added: amount
    });
  } catch (error) {
    logger.error('Add credits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'api-gateway-control-plane'
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      logger.info(`Control Plane API running on port ${PORT}`);
      console.log(`🚀 Control Plane API running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();