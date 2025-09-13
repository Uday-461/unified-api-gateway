# API Gateway Middleware - Technical Architecture (Zuplo-Based)

## 🏆 Recommended Tech Stack

### Core Components
- **API Gateway**: Zuplo (Cloud-Native Managed Service)
- **Business Logic Layer**: Node.js + Express/Fastify (TypeScript)
- **Database**: PostgreSQL 
- **Cache**: Built-in Zuplo caching + optional Redis for complex digital
- **Payments**: Dodo Webhooks
- **Monitoring**: Zuplo Analytics + optional custom metrics
- **Configuration**: TypeScript policies + JSON configuration files

## 📐 System Architecture (Zuplo-Based)

```
┌─────────────────┐
│   User Client   │
└────────┬────────┘
         │ HTTPS/SSE
         ▼
┌─────────────────────────────────────────┐
│        Zuplo API Gateway (Managed)       │
│   - SSL Termination (Built-in)          │
│   - Rate Limiting (Built-in)             │
│   - Custom Auth Policies (TypeScript)   │
│   - Request/Response Transform           │
│   - Analytics & Monitoring               │
│   - Edge Caching                         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│   Control Plane API (Node.js:3000)      │
│   - Credit Check & Deduction            │
│   - Request Enrichment                  │
│   - Usage Logging                       │
│   - Vendor Credential Management        │
└────────┬────────────────────────────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Postgres│ │Vendor  │ │Payment │ │ Zuplo  │
│   DB   │ │  APIs  │ │Webhook │ │Analytics│
└────────┘ └────────┘ └────────┘ └────────┘
```

## 💾 Database Schema (Simplified for MVP)

```sql
-- Core Tables (MVP Version)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    credits DECIMAL(10,2) DEFAULT 100.00, -- Start with free credits
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL, -- For easy identification (e.g., 'zup_')
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    api_key_encrypted TEXT, -- Encrypted vendor API key
    default_headers JSONB DEFAULT '{}', -- Common headers for this vendor
    rate_limit_per_minute INTEGER DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE apis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    endpoint VARCHAR(500) NOT NULL, -- Relative path from vendor base_url
    method VARCHAR(10) DEFAULT 'POST',
    cost_per_call DECIMAL(10,4) DEFAULT 1.0000,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    api_id UUID REFERENCES apis(id),
    request_id VARCHAR(255) UNIQUE, -- Zuplo request ID
    credits_used DECIMAL(10,4),
    status VARCHAR(20), -- 'success', 'failed', 'insufficient_credits'
    response_status INTEGER, -- HTTP status code
    latency_ms INTEGER, -- Response time in milliseconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Future: Add payments table when payment integration is ready
-- CREATE TABLE payments (...) -- Commented out for MVP

-- Essential Indexes
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id) WHERE status = 'active';
CREATE INDEX idx_usage_logs_user_date ON usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_logs_api_date ON usage_logs(api_id, created_at DESC);
CREATE INDEX idx_users_email ON users(email) WHERE status = 'active';

-- Add some sample data for testing
INSERT INTO vendors (name, base_url, api_key_encrypted, default_headers) VALUES 
('OpenAI', 'https://api.openai.com', 'encrypted_key_here', '{"Content-Type": "application/json"}'),
('Anthropic', 'https://api.anthropic.com', 'encrypted_key_here', '{"Content-Type": "application/json", "anthropic-version": "2023-06-01"}');

INSERT INTO apis (vendor_id, name, endpoint, method, cost_per_call, description) VALUES 
((SELECT id FROM vendors WHERE name = 'OpenAI'), 'GPT-4', '/v1/chat/completions', 'POST', 0.03, 'GPT-4 Chat Completions'),
((SELECT id FROM vendors WHERE name = 'OpenAI'), 'GPT-3.5', '/v1/chat/completions', 'POST', 0.002, 'GPT-3.5 Turbo Chat Completions'),
((SELECT id FROM vendors WHERE name = 'Anthropic'), 'Claude-3', '/v1/messages', 'POST', 0.015, 'Claude-3 Messages API');
```

## 🔧 Zuplo Configuration Files

### 1. Project Structure
```
api-gateway/
├── zuplo.jsonc              # Main Zuplo configuration
├── config/
│   └── routes.oas.json      # OpenAPI routes definition
├── modules/
│   ├── auth.ts              # Authentication logic
│   ├── credit-check.ts      # Credit validation
│   └── vendor-proxy.ts      # Vendor API proxying
├── policies/
│   ├── api-key-auth.ts      # API key validation policy
│   ├── credit-validation.ts # Credit check policy
│   ├── request-enrichment.ts # Request transformation
│   └── usage-logging.ts     # Usage tracking policy
└── tests/
    └── api.test.ts          # API endpoint tests
```

### 2. Main Configuration (zuplo.jsonc)
```json
{
  "$schema": "https://cdn.zuplo.com/schemas/zuplo.jsonc",
  "name": "api-gateway",
  "description": "AI API Gateway with credit system",
  "version": "1.0.0",
  "environment": {
    "variables": {
      "DATABASE_URL": "$env(DATABASE_URL)",
      "CONTROL_PLANE_URL": "$env(CONTROL_PLANE_URL)",
      "ENCRYPTION_KEY": "$env(ENCRYPTION_KEY)"
    }
  },
  "policies": [
    {
      "name": "api-key-auth",
      "policyType": "api-key-auth-inbound",
      "handler": {
        "export": "default",
        "module": "$import(./policies/api-key-auth)"
      }
    },
    {
      "name": "credit-validation",
      "policyType": "function-inbound",
      "handler": {
        "export": "default",
        "module": "$import(./policies/credit-validation)"
      }
    },
    {
      "name": "request-enrichment",
      "policyType": "function-inbound",
      "handler": {
        "export": "default",
        "module": "$import(./policies/request-enrichment)"
      }
    },
    {
      "name": "usage-logging",
      "policyType": "function-outbound",
      "handler": {
        "export": "default",
        "module": "$import(./policies/usage-logging)"
      }
    }
  ]
}
```

### 3. Routes Configuration (config/routes.oas.json)
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "AI API Gateway",
    "version": "1.0.0",
    "description": "Unified API gateway for AI services with credit management"
  },
  "paths": {
    "/api/v1/{vendor}/{model}": {
      "post": {
        "summary": "Proxy to AI vendor APIs",
        "parameters": [
          {
            "name": "vendor",
            "in": "path",
            "required": true,
            "schema": { "type": "string", "enum": ["openai", "anthropic"] }
          },
          {
            "name": "model",
            "in": "path", 
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "type": "object" }
            }
          }
        },
        "x-zuplo-route": {
          "corsPolicy": "anything-goes",
          "policies": {
            "inbound": [
              "api-key-auth",
              "credit-validation", 
              "request-enrichment"
            ],
            "outbound": [
              "usage-logging"
            ]
          },
          "handler": {
            "export": "default",
            "module": "$import(./modules/vendor-proxy)"
          }
        }
      }
    },
    "/api/v1/user/credits": {
      "get": {
        "summary": "Get user credit balance",
        "x-zuplo-route": {
          "corsPolicy": "anything-goes",
          "policies": {
            "inbound": ["api-key-auth"]
          },
          "handler": {
            "export": "getCreditBalance",
            "module": "$import(./modules/auth)"
          }
        }
      }
    }
  }
}
```

## 🔧 Implementation Steps

### Phase 1: Core Infrastructure (Week 1)

1. **Setup Zuplo Project**
```bash
# Install Zuplo CLI
npm install -g @zuplo/cli

# Initialize new Zuplo project
mkdir api-gateway && cd api-gateway
zuplo init

# Link to your Zuplo account (requires API key from web portal)
export ZUPLO_API_KEY="your-api-key-here"
zuplo link

# Setup local development environment
zuplo dev
```

**Docker Compose for Control Plane & Database**
```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: api_gateway
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  control-plane:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/api_gateway
      NODE_ENV: development
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules

volumes:
  postgres_data:
```

2. **Setup Control Plane API (TypeScript)**
```typescript
// src/server.ts - Express API with TypeScript
import express from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Types
interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
  status: string;
}

interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  status: string;
}

// Utility functions
function hashApiKey(apiKey: string): string {
  return bcrypt.hashSync(apiKey, 10);
}

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `zup_${crypto.randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 8);
  return { key, hash, prefix };
}

// API Key validation for Zuplo policies
app.post('/auth/validate', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Query database for user
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
    
    res.json({
      valid: true,
      user_id: user.id,
      credits: user.credits,
      context: {
        userId: user.id,
        userEmail: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('Auth validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Credit validation and API lookup
app.post('/credit/validate', async (req, res) => {
  try {
    const { user_id, vendor, model } = req.body;
    
    // Get API details
    const apiResult = await db.query(
      `SELECT a.*, v.name as vendor_name, v.base_url, v.api_key_encrypted, v.default_headers
       FROM apis a
       JOIN vendors v ON a.vendor_id = v.id
       WHERE v.name = $1 AND a.name = $2 AND a.is_active = true`,
      [vendor, model]
    );
    
    if (apiResult.rows.length === 0) {
      return res.status(404).json({ error: 'API not found' });
    }
    
    const api = apiResult.rows[0];
    
    // Check user credits
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
    
    res.json({
      valid: true,
      api_id: api.id,
      cost: api.cost_per_call,
      vendor_url: api.base_url + api.endpoint,
      vendor_headers: JSON.parse(api.default_headers || '{}'),
      api_key: decrypt(api.api_key_encrypted)
    });
  } catch (error) {
    console.error('Credit validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Usage logging & credit deduction
app.post('/usage/log', async (req, res) => {
  try {
    const { 
      user_id, 
      api_id, 
      request_id, 
      status, 
      response_status, 
      latency_ms 
    } = req.body;
    
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      // Get API cost
      const apiResult = await client.query(
        'SELECT cost_per_call FROM apis WHERE id = $1',
        [api_id]
      );
      
      if (apiResult.rows.length === 0) {
        throw new Error('API not found');
      }
      
      const cost = apiResult.rows[0].cost_per_call;
      
      // Only deduct credits for successful requests
      if (status === 'success') {
        await client.query(
          'UPDATE users SET credits = credits - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [cost, user_id]
        );
      }
      
      // Log usage
      await client.query(
        `INSERT INTO usage_logs 
         (user_id, api_id, request_id, credits_used, status, response_status, latency_ms) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user_id, api_id, request_id, status === 'success' ? cost : 0, status, response_status, latency_ms]
      );
      
      await client.query('COMMIT');
      
      res.json({ success: true, credits_deducted: status === 'success' ? cost : 0 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Usage logging error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User management endpoints
app.get('/user/:id/credits', async (req, res) => {
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
    console.error('Get credits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Add credits (for MVP manual top-up)
app.post('/admin/user/:id/credits', async (req, res) => {
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
    
    res.json({ 
      success: true, 
      new_balance: result.rows[0].credits,
      added: amount
    });
  } catch (error) {
    console.error('Add credits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Control Plane API running on port ${PORT}`);
});

// Utility function for decryption (implement based on your encryption method)
function decrypt(encryptedText: string): string {
  // Implement your decryption logic here
  // This is a placeholder - use your actual encryption/decryption method
  return encryptedText; // TODO: Implement actual decryption
}
```

### Phase 2: Zuplo Policies (Week 1-2)

1. **API Key Authentication Policy**
```typescript
// policies/api-key-auth.ts
import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

interface AuthResponse {
  valid: boolean;
  user_id: string;
  credits: number;
  context: {
    userId: string;
    userEmail: string;
    credits: number;
  };
}

export default async function apiKeyAuth(
  request: ZuploRequest,
  context: ZuploContext
) {
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key required' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/auth/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const authData: AuthResponse = await response.json();
    
    // Store user context for downstream policies
    context.custom.user = authData.context;
    
    return request;
  } catch (error) {
    context.log.error('Auth policy error:', error);
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
```

2. **Credit Validation Policy**
```typescript
// policies/credit-validation.ts
import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function creditValidation(
  request: ZuploRequest,
  context: ZuploContext
) {
  try {
    const user = context.custom.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User context not found' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Extract vendor and model from path
    const pathParts = new URL(request.url).pathname.split('/');
    const vendor = pathParts[3]; // /api/v1/{vendor}/{model}
    const model = pathParts[4];

    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/credit/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        vendor,
        model
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify(error),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }

    const creditData = await response.json();
    
    // Store API context for downstream policies
    context.custom.api = creditData;
    
    return request;
  } catch (error) {
    context.log.error('Credit validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Credit validation failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
```

3. **Vendor Proxy Module**
```typescript
// modules/vendor-proxy.ts
import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function vendorProxy(
  request: ZuploRequest,
  context: ZuploContext
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  try {
    const user = context.custom.user;
    const api = context.custom.api;
    
    if (!user || !api) {
      throw new Error('Missing user or API context');
    }

    // Get request body
    const requestBody = await request.text();
    
    // Prepare vendor request
    const vendorHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api.api_key}`,
      ...api.vendor_headers
    };

    // Proxy to vendor
    const vendorResponse = await fetch(api.vendor_url, {
      method: request.method,
      headers: vendorHeaders,
      body: requestBody
    });

    const responseBody = await vendorResponse.text();
    const endTime = Date.now();
    const latency = endTime - startTime;

    // Log usage asynchronously
    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    fetch(`${controlPlaneUrl}/usage/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        api_id: api.api_id,
        request_id: requestId,
        status: vendorResponse.ok ? 'success' : 'failed',
        response_status: vendorResponse.status,
        latency_ms: latency
      })
    }).catch(error => {
      context.log.error('Usage logging failed:', error);
    });

    // Return vendor response
    return new Response(responseBody, {
      status: vendorResponse.status,
      statusText: vendorResponse.statusText,
      headers: {
        'Content-Type': vendorResponse.headers.get('Content-Type') || 'application/json',
        'X-Request-ID': requestId,
        'X-Credits-Used': api.cost.toString()
      }
    });
  } catch (error) {
    context.log.error('Vendor proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Proxy request failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
```

### Phase 3: Local Development & Testing (Week 2)

```bash
# Local development workflow

# 1. Start local services
docker-compose up -d postgres
npm run dev  # Start control plane API

# 2. Start Zuplo development server
zuplo dev

# 3. Test API endpoints
curl -X POST http://localhost:9000/api/v1/openai/gpt-4 \
  -H "Content-Type: application/json" \
  -H "x-api-key: zup_your_test_key_here" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'

# 4. Check user credits
curl -X GET http://localhost:3000/user/{user_id}/credits

# 5. Run tests
npm test
```

**Test Configuration**
```typescript
// tests/api.test.ts
import { describe, it, expect } from '@jest/globals';

describe('API Gateway', () => {
  it('should validate API key', async () => {
    const response = await fetch('http://localhost:9000/api/v1/openai/gpt-4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'invalid_key'
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    });
    
    expect(response.status).toBe(401);
  });

  it('should check credits before proxying', async () => {
    // Test with user having insufficient credits
    const response = await fetch('http://localhost:9000/api/v1/openai/gpt-4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'zup_test_key_no_credits'
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    });
    
    expect(response.status).toBe(402);
  });
});
```

### Phase 4: Deployment & Monitoring (Week 2-3)

```bash
# Deployment workflow

# 1. Deploy to Zuplo
git add .
git commit -m "Deploy API gateway"
git push origin main

# Deploy current branch to Zuplo
zuplo deploy

# 2. Deploy control plane to DigitalOcean VPS
# Follow the detailed VPS setup instructions above

# 3. Update environment variables in Zuplo
zuplo variables create CONTROL_PLANE_URL https://your-domain.com
zuplo variables create DATABASE_URL postgresql://api_user:password@your-droplet-ip:5432/api_gateway
```

**Environment Configuration**
```bash
# .env.example
DATABASE_URL=postgresql://postgres:password@localhost:5432/api_gateway
CONTROL_PLANE_URL=http://localhost:3000
ENCRYPTION_KEY=your-32-char-encryption-key-here
NODE_ENV=development
PORT=3000

# Zuplo environment variables (set via CLI)
zuplo variables create DATABASE_URL $DATABASE_URL
zuplo variables create CONTROL_PLANE_URL $CONTROL_PLANE_URL
zuplo variables create ENCRYPTION_KEY $ENCRYPTION_KEY
```

**Basic Monitoring with Zuplo Analytics**
```typescript
// Add to policies for custom metrics
export function trackMetric(context: ZuploContext, metric: string, value: number) {
  context.log.info('Custom metric', { metric, value, timestamp: Date.now() });
}

// Usage in policies:
trackMetric(context, 'credits_used', api.cost);
trackMetric(context, 'request_latency', latency);
```

## 🚀 Simplified Deployment Architecture

### Recommended Stack for MVP
```yaml
# Production deployment options:

# Option 1: DigitalOcean VPS (Recommended for MVP)
# 1. Zuplo (Managed API Gateway)
# 2. DigitalOcean Droplet (Control Plane API + PostgreSQL)
# 3. Full control and cost-effective

# Option 2: DigitalOcean App Platform
# 1. Zuplo (Managed API Gateway) 
# 2. DigitalOcean App Platform (Control Plane API)
# 3. DigitalOcean Managed PostgreSQL

# Option 3: Traditional Cloud (Later)
# 1. Zuplo (Managed API Gateway)
# 2. AWS ECS/Lambda (Control Plane API)
# 3. AWS RDS (PostgreSQL)
```

**DigitalOcean VPS Deployment**
```bash
# 1. Create DigitalOcean Droplet
# - Ubuntu 22.04 LTS
# - $6/month (1GB RAM, 1 vCPU, 25GB SSD)
# - Enable monitoring and backups

# 2. Initial server setup
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PostgreSQL 15
apt install -y postgresql postgresql-contrib

# Install PM2 for process management
npm install -g pm2

# Install Nginx for reverse proxy
apt install -y nginx

# Setup firewall
ufw allow ssh
ufw allow http
ufw allow https
ufw enable
```

**PostgreSQL Setup**
```bash
# 3. Configure PostgreSQL
sudo -u postgres psql

# Create database and user
CREATE DATABASE api_gateway;
CREATE USER api_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE api_gateway TO api_user;
ALTER USER api_user CREATEDB;
\q

# Configure PostgreSQL for connections
nano /etc/postgresql/15/main/postgresql.conf
# Change: listen_addresses = 'localhost'

nano /etc/postgresql/15/main/pg_hba.conf
# Add: local   api_gateway     api_user                                md5

# Restart PostgreSQL
systemctl restart postgresql
```

**Application Deployment**
```bash
# 4. Deploy Control Plane API
# Create app directory
mkdir -p /var/www/api-gateway
cd /var/www/api-gateway

# Clone your repository
git clone https://github.com/your-username/api-gateway.git .

# Install dependencies
npm ci --only=production

# Build TypeScript
npm run build

# Create environment file
cat > .env << EOF
DATABASE_URL=postgresql://api_user:secure_password_here@localhost:5432/api_gateway
NODE_ENV=production
PORT=3000
ENCRYPTION_KEY=your-32-char-encryption-key-here
EOF

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'api-gateway',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/api-gateway/error.log',
    out_file: '/var/log/api-gateway/out.log',
    log_file: '/var/log/api-gateway/combined.log',
    time: true
  }]
};
EOF

# Create log directory
mkdir -p /var/log/api-gateway

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Nginx Reverse Proxy Configuration**
```bash
# 5. Configure Nginx
cat > /etc/nginx/sites-available/api-gateway << EOF
server {
    listen 80;
    server_name your-domain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:3000/health;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/api-gateway /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

**SSL Certificate with Let's Encrypt**
```bash
# 6. Setup SSL
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal (already configured by certbot)
systemctl status certbot.timer
```

**Monitoring and Maintenance Scripts**
```bash
# 7. Create maintenance scripts
cat > /root/backup-db.sh << EOF
#!/bin/bash
DATE=\$(date +%Y%m%d_%H%M%S)
pg_dump -U api_user -h localhost api_gateway > /backup/api_gateway_\$DATE.sql
# Keep only last 7 days of backups
find /backup -name "api_gateway_*.sql" -mtime +7 -delete
EOF

chmod +x /root/backup-db.sh

# Add to crontab for daily backups
crontab -e
# Add: 0 2 * * * /root/backup-db.sh

# Create update script
cat > /root/update-app.sh << EOF
#!/bin/bash
cd /var/www/api-gateway
git pull origin main
npm ci --only=production
npm run build
pm2 restart api-gateway
EOF

chmod +x /root/update-app.sh
```

## 📊 Monitoring & Analytics (Simplified)

### Built-in Zuplo Analytics
- ✅ Request/Response metrics
- ✅ Latency tracking
- ✅ Error rate monitoring
- ✅ Geographic distribution
- ✅ API key usage stats

### Custom Metrics (Optional)
```typescript
// Simple logging in control plane
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'api-gateway.log' }),
    new winston.transports.Console()
  ]
});

// Usage tracking
logger.info('API call', {
  user_id,
  api_id,
  credits_used,
  latency_ms,
  status
});

// Credit balance alerts
if (user.credits < 10) {
  logger.warn('Low credit balance', { user_id, credits: user.credits });
}
```

### Database Analytics Queries
```sql
-- Top APIs by usage
SELECT 
  a.name,
  v.name as vendor,
  COUNT(*) as total_calls,
  SUM(ul.credits_used) as total_credits
FROM usage_logs ul
JOIN apis a ON ul.api_id = a.id
JOIN vendors v ON a.vendor_id = v.id
WHERE ul.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY a.id, a.name, v.name
ORDER BY total_calls DESC;

-- User activity summary
SELECT 
  u.email,
  u.credits,
  COUNT(ul.id) as api_calls_today,
  SUM(ul.credits_used) as credits_used_today
FROM users u
LEFT JOIN usage_logs ul ON u.id = ul.user_id 
  AND ul.created_at >= CURRENT_DATE
GROUP BY u.id, u.email, u.credits
ORDER BY credits_used_today DESC;
```

## 🔒 Security Considerations (Simplified)

### 1. API Key Security
```typescript
// Strong API key generation
function generateSecureApiKey(): string {
  return `zup_${crypto.randomBytes(32).toString('hex')}`;
}

// Secure hashing
import bcrypt from 'bcrypt';
const hashedKey = await bcrypt.hash(apiKey, 12);
```

### 2. Rate Limiting (Built into Zuplo)
```json
// In zuplo.jsonc policies
{
  "name": "rate-limit",
  "policyType": "rate-limit-inbound",
  "handler": {
    "export": "RateLimitInboundPolicy",
    "module": "@zuplo/runtime",
    "options": {
      "rateLimitBy": "user",
      "requestsAllowed": 100,
      "timeWindowMinutes": 1
    }
  }
}
```

### 3. Environment Security
```bash
# Use environment variables for secrets
ENCRYPTION_KEY=your-32-char-key
DATABASE_URL=postgresql://...

# Never commit secrets to git
echo "*.env" >> .gitignore
echo "*.env.local" >> .gitignore
```

### 4. Input Validation
```typescript
// Simple validation in TypeScript
function validateApiRequest(body: any): boolean {
  return (
    body &&
    typeof body === 'object' &&
    Array.isArray(body.messages) &&
    body.messages.length > 0
  );
}
```

## 💰 Cost Optimization (MVP Focus)

### 1. Leverage Zuplo's Built-in Caching
```typescript
// Cache user auth responses
const cacheKey = `user:${apiKey}`;
const cached = await context.cache.get(cacheKey);
if (!cached) {
  const userData = await fetchUserData(apiKey);
  await context.cache.put(cacheKey, userData, { ttl: 300 }); // 5 min
}
```

### 2. Database Connection Pooling
```typescript
// Efficient connection pooling
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 3. MVP Cost Structure
- **Zuplo**: Free tier (10K requests/month) → $29/month
- **DigitalOcean VPS**: $6/month (1GB RAM, 1 vCPU, 25GB SSD)
- **Total MVP Cost**: ~$35/month

### 4. Usage-Based Pricing Model
```typescript
// Simple credit pricing
const PRICING = {
  'gpt-4': 0.03,        // per request
  'gpt-3.5-turbo': 0.002,
  'claude-3': 0.015
};

// Credit packages
const CREDIT_PACKAGES = {
  starter: { credits: 100, price: 10 },   // $0.10 per credit
  pro: { credits: 1000, price: 80 },      // $0.08 per credit  
  enterprise: { credits: 10000, price: 600 } // $0.06 per credit
};
```

## 📈 Revised MVP Timeline (Zuplo-Based)

### Week 1: Foundation
- ✅ Setup Zuplo project and CLI
- ✅ Create PostgreSQL schema (simplified)
- ✅ Build control plane API (TypeScript)
- ✅ Implement API key authentication
- ✅ Basic credit validation

### Week 2: Core Features
- ✅ Zuplo policies (auth, credit check, proxy)
- ✅ Vendor API integration (OpenAI, Anthropic)
- ✅ Usage logging and credit deduction
- ✅ Local development setup
- ✅ Basic testing

### Week 3: Polish & Deploy
- ✅ Error handling and validation
- ✅ Admin endpoints (manual credit top-up)
- ✅ Deploy to DigitalOcean VPS + Zuplo
- ✅ Basic monitoring setup
- ✅ Documentation

### Week 4: Testing & Launch
- ✅ End-to-end testing
- ✅ Performance optimization
- ✅ Security review
- ✅ Beta user onboarding
- ✅ Launch preparation

### Future Enhancements (Post-MVP)
- 📋 Payment integration (Dodo webhooks)
- 📋 SSE streaming support
- 📋 Advanced analytics dashboard
- 📋 Multi-tenant features
- 📋 API rate limiting per user
- 📋 Webhook notifications for low credits

## 🚀 Getting Started (AI Engineer Instructions)

### Prerequisites
1. **Manual Setup Required (5 minutes)**:
   - Create Zuplo account at https://zuplo.com
   - Generate API key from Zuplo dashboard
   - Share API key with AI engineer

2. **AI Engineer Setup**:
```bash
# Install dependencies
npm install -g @zuplo/cli
npm install -g typescript

# Clone and setup project
git clone <repository>
cd api-gateway
npm install

# Setup environment
cp .env.example .env
# Edit .env with actual values

# Initialize Zuplo
export ZUPLO_API_KEY="your-api-key"
zuplo link

# Start development
docker-compose up -d postgres
npm run dev
zuplo dev
```

### Development Workflow
```bash
# 1. Make changes to policies/modules
# 2. Test locally
zuplo dev

# 3. Deploy to Zuplo
git add .
git commit -m "Update API gateway"
zuplo deploy

# 4. Deploy control plane to DigitalOcean
ssh root@your-droplet-ip
cd /var/www/api-gateway
/root/update-app.sh  # Use the update script
```

### Key Files to Create
1. `zuplo.jsonc` - Main configuration
2. `config/routes.oas.json` - API routes
3. `policies/api-key-auth.ts` - Authentication
4. `policies/credit-validation.ts` - Credit checking
5. `modules/vendor-proxy.ts` - Vendor proxying
6. `src/server.ts` - Control plane API
7. `docker-compose.yml` - Local development

This Zuplo-based architecture is **95% code-manageable** and perfect for AI engineer development! 🎯
