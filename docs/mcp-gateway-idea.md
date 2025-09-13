# Unified API Gateway: LLM + MCP HTTPS Gateway

## 🎯 Vision
A unified API gateway that supports **both** LLM API calls (OpenAI, Anthropic, etc.) and MCP HTTPS server proxying in a single system with shared authentication, billing, and monitoring.

## 🏗️ Dual Gateway Architecture

```mermaid
graph TD
    subgraph "Client Applications"
        LLMClient[LLM Client Apps]
        MCPClient[MCP Client Apps]
    end

    subgraph "Zuplo Edge Gateway"
        Router{Route Dispatcher}
        
        subgraph "LLM Gateway Path"
            LLMAuth[LLM Auth Policy]
            LLMCredit[LLM Credit Check]
            LLMProxy[LLM Vendor Proxy]
        end
        
        subgraph "MCP Gateway Path"
            MCPAuth[MCP Auth Policy]
            MCPCredit[MCP Credit Check]
            MCPProxy[MCP Server Proxy]
        end
    end
    
    subgraph "Control Plane API"
        AuthService[Auth Service]
        CreditService[Credit Service]
        UsageService[Usage Logging]
    end
    
    subgraph "Data Layer"
        PostgresDB[(PostgreSQL)]
        subgraph "Tables"
            Users[users]
            APIKeys[api_keys]
            Vendors[vendors]
            APIs[apis]
            MCPServers[mcp_servers]
            ToolPricing[tool_pricing]
            UsageLogs[usage_logs]
        end
    end
    
    subgraph "Upstream Services"
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        MCPServer1[MCP Server 1]
        MCPServer2[MCP Server 2]
        MCPServerN[MCP Server N]
    end

    LLMClient --> Router
    MCPClient --> Router
    
    Router -->|/api/v1/{vendor}/{model}| LLMAuth
    Router -->|/api/mcp/{serverId}| MCPAuth
    
    LLMAuth --> LLMCredit
    LLMCredit --> LLMProxy
    LLMProxy --> OpenAI
    LLMProxy --> Anthropic
    
    MCPAuth --> MCPCredit
    MCPCredit --> MCPProxy
    MCPProxy --> MCPServer1
    MCPProxy --> MCPServer2
    MCPProxy --> MCPServerN
    
    LLMAuth --> AuthService
    MCPAuth --> AuthService
    LLMCredit --> CreditService
    MCPCredit --> CreditService
    LLMProxy --> UsageService
    MCPProxy --> UsageService
    
    AuthService --> PostgresDB
    CreditService --> PostgresDB
    UsageService --> PostgresDB
    
    PostgresDB --> Users
    PostgresDB --> APIKeys
    PostgresDB --> Vendors
    PostgresDB --> APIs
    PostgresDB --> MCPServers
    PostgresDB --> ToolPricing
    PostgresDB --> UsageLogs
```

## 📊 Extended Database Schema

### Current Tables (Keep as-is)
```sql
-- Existing LLM Gateway tables
users, api_keys, vendors, apis, usage_logs
```

### New MCP Tables
```sql
-- MCP Server registry
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
    server_id VARCHAR(255) UNIQUE NOT NULL, -- Public server identifier
    https_url VARCHAR(500) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    published BOOLEAN DEFAULT false,
    free_requests_per_day INTEGER DEFAULT 0,
    auth_type VARCHAR(50) DEFAULT 'bearer', -- 'bearer', 'api_key', 'none'
    auth_config JSONB DEFAULT '{}', -- Flexible auth configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tool-specific pricing for MCP servers
CREATE TABLE tool_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    cost_per_call DECIMAL(10,4) DEFAULT 0.01,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, tool_name)
);

-- Daily free usage tracking for MCP servers
CREATE TABLE daily_free_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, server_id, date)
);

-- Extend usage_logs to support both LLM and MCP
ALTER TABLE usage_logs 
ADD COLUMN server_id UUID REFERENCES mcp_servers(id),
ADD COLUMN tool_name VARCHAR(255),
ADD COLUMN gateway_type VARCHAR(20) DEFAULT 'llm', -- 'llm' or 'mcp'
ADD COLUMN is_upstream_error BOOLEAN DEFAULT false;

-- Indexes for performance
CREATE INDEX idx_mcp_servers_server_id ON mcp_servers(server_id) WHERE published = true;
CREATE INDEX idx_tool_pricing_server_tool ON tool_pricing(server_id, tool_name);
CREATE INDEX idx_daily_usage_user_server_date ON daily_free_usage(user_id, server_id, date);
CREATE INDEX idx_usage_logs_gateway_type ON usage_logs(gateway_type, created_at DESC);
```

## 🛣️ API Routes Structure

### LLM Gateway Routes (Existing)
```
POST /api/v1/{vendor}/{model}     # OpenAI, Anthropic, etc.
GET  /api/v1/user/credits         # User credit balance
```

### MCP Gateway Routes (New)
```
POST /api/mcp/{serverId}          # Proxy to MCP server
GET  /api/mcp/servers             # List available MCP servers
GET  /api/mcp/server/{serverId}   # Get server details & pricing
```

### Management Routes (Enhanced)
```
# User Management
GET    /user/{id}/credits         # Credit balance
POST   /admin/user/{id}/credits   # Add credits
GET    /user/{id}/usage           # Usage history (both LLM & MCP)

# MCP Server Management
POST   /admin/mcp/servers         # Register MCP server
PUT    /admin/mcp/servers/{id}    # Update MCP server
DELETE /admin/mcp/servers/{id}    # Remove MCP server
POST   /admin/mcp/servers/{id}/pricing  # Set tool pricing
```

## 🔧 Implementation Plan

### Phase 1: Database Extension (Week 1)
- [ ] Add MCP-specific tables to existing schema
- [ ] Create migration scripts
- [ ] Update existing usage_logs table
- [ ] Add sample MCP server data

### Phase 2: Control Plane Extensions (Week 1-2)
- [ ] Extend `/auth/validate` to handle both gateway types
- [ ] Create `/credit/validate/mcp` endpoint for MCP servers
- [ ] Create `/usage/log` extensions for MCP tracking
- [ ] Add MCP server management endpoints

### Phase 3: Zuplo Route Configuration (Week 2)
- [ ] Add MCP routes to `routes.oas.json`
- [ ] Create MCP-specific policies
- [ ] Implement route-based gateway detection
- [ ] Configure dual routing logic

### Phase 4: MCP Proxy Implementation (Week 2-3)
- [ ] Create `modules/mcp-proxy.ts`
- [ ] Implement tool name extraction from MCP requests
- [ ] Add MCP-specific error handling
- [ ] Implement free tier usage tracking

### Phase 5: Testing & Integration (Week 3)
- [ ] Create MCP-specific test cases
- [ ] Test dual gateway functionality
- [ ] Performance testing with both gateway types
- [ ] End-to-end integration testing

## 🔄 Request Flow Comparison

### LLM Gateway Flow
```
Client → /api/v1/openai/gpt-4 → Auth → Credit Check → Vendor Proxy → OpenAI API
```

### MCP Gateway Flow  
```
Client → /api/mcp/server123 → Auth → Credit Check → MCP Proxy → MCP Server
```

## 💡 Key Implementation Details

### 1. Route Detection Logic
```typescript
// In Zuplo route configuration
const isLLMRoute = request.url.includes('/api/v1/');
const isMCPRoute = request.url.includes('/api/mcp/');

if (isLLMRoute) {
  // Use existing LLM policies and proxy
} else if (isMCPRoute) {
  // Use new MCP policies and proxy
}
```

### 2. Unified Credit System
- **Same credit balance** for both LLM and MCP usage
- **Different pricing models**: LLM per model call, MCP per tool call
- **Free tier support**: Daily free requests for MCP servers

### 3. Enhanced Usage Logging
```typescript
interface UsageLog {
  // Existing fields
  user_id: string;
  request_id: string;
  credits_used: number;
  status: string;
  
  // New fields for dual gateway
  gateway_type: 'llm' | 'mcp';
  
  // LLM-specific (existing)
  api_id?: string;
  
  // MCP-specific (new)
  server_id?: string;
  tool_name?: string;
  is_upstream_error?: boolean;
}
```

### 4. MCP Server Registration
```typescript
interface MCPServer {
  id: string;
  provider_id: string;
  server_id: string;        // Public identifier (e.g., "weather-tools")
  https_url: string;        // https://api.weather-tools.com
  name: string;             // "Weather Tools Server"
  description: string;
  published: boolean;
  free_requests_per_day: number;
  auth_type: 'bearer' | 'api_key' | 'none';
  auth_config: {
    header_name?: string;
    token_prefix?: string;
  };
}
```

### 5. Tool Pricing Configuration
```typescript
interface ToolPricing {
  server_id: string;
  tool_name: string;        // e.g., "get_weather", "search_location"
  cost_per_call: number;    // Credits per tool call
  description?: string;
}
```

## 🎯 Benefits of Unified Approach

### For Users
- **Single API key** for both LLM and MCP access
- **Unified billing** and credit management
- **Consistent authentication** across all services
- **Single dashboard** for usage monitoring

### For Developers
- **Shared infrastructure** reduces maintenance overhead
- **Common policies** for auth, rate limiting, logging
- **Unified monitoring** and analytics
- **Single deployment pipeline**

### For MCP Server Providers
- **Easy registration** process
- **Flexible pricing** models per tool
- **Built-in authentication** and rate limiting
- **Usage analytics** and revenue tracking

## 🚀 Migration Strategy

### Option 1: Gradual Rollout (Recommended)
1. Keep existing LLM gateway running
2. Add MCP tables and endpoints
3. Deploy MCP routes alongside LLM routes
4. Test with beta MCP servers
5. Full production rollout

### Option 2: Big Bang Deployment
1. Deploy all changes at once
2. Higher risk but faster implementation
3. Requires extensive testing

## 📈 Success Metrics

### Technical Metrics
- **Response time**: <100ms overhead for both gateways
- **Uptime**: 99.9% availability
- **Error rate**: <1% for both LLM and MCP requests

### Business Metrics
- **MCP server adoption**: Number of registered servers
- **Tool usage**: Calls per MCP tool
- **Revenue distribution**: LLM vs MCP usage
- **User engagement**: Users using both gateways

## 🔒 Security Considerations

### Shared Security Features
- API key authentication for both gateways
- Rate limiting per user
- Credit-based access control
- Request/response logging

### MCP-Specific Security
- MCP server URL validation
- Tool name sanitization
- Upstream error handling
- Server authentication configuration

## 💰 Pricing Strategy

### LLM Gateway (Existing)
- GPT-4: $0.03 per request
- GPT-3.5: $0.002 per request
- Claude-3: $0.015 per request

### MCP Gateway (New)
- **Default**: $0.01 per tool call
- **Custom pricing** per server/tool combination
- **Free tier**: 100 requests/day per server
- **Bulk pricing**: Discounts for high-volume users

This unified approach gives you the best of both worlds - maintaining your existing LLM gateway while adding powerful MCP server proxying capabilities! 🎯
