-- API Gateway Database Schema with MCP Support
-- PostgreSQL 15+ compatible

-- Core Tables (LLM Gateway - Existing)
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

-- MCP Server registry (New for MCP Gateway)
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

-- Enhanced usage_logs to support both LLM and MCP
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    request_id VARCHAR(255) UNIQUE, -- Zuplo request ID
    credits_used DECIMAL(10,4),
    status VARCHAR(20), -- 'success', 'failed', 'insufficient_credits'
    response_status INTEGER, -- HTTP status code
    latency_ms INTEGER, -- Response time in milliseconds

    -- LLM Gateway fields (existing)
    api_id UUID REFERENCES apis(id),

    -- MCP Gateway fields (new)
    server_id UUID REFERENCES mcp_servers(id),
    tool_name VARCHAR(255),
    gateway_type VARCHAR(20) DEFAULT 'llm', -- 'llm' or 'mcp'
    is_upstream_error BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Essential Indexes (LLM Gateway - Existing)
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id) WHERE status = 'active';
CREATE INDEX idx_usage_logs_user_date ON usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_logs_api_date ON usage_logs(api_id, created_at DESC);
CREATE INDEX idx_users_email ON users(email) WHERE status = 'active';

-- MCP Gateway Indexes (New)
CREATE INDEX idx_mcp_servers_server_id ON mcp_servers(server_id) WHERE published = true;
CREATE INDEX idx_mcp_servers_provider ON mcp_servers(provider_id);
CREATE INDEX idx_tool_pricing_server_tool ON tool_pricing(server_id, tool_name);
CREATE INDEX idx_daily_usage_user_server_date ON daily_free_usage(user_id, server_id, date);
CREATE INDEX idx_usage_logs_gateway_type ON usage_logs(gateway_type, created_at DESC);
CREATE INDEX idx_usage_logs_server_date ON usage_logs(server_id, created_at DESC) WHERE gateway_type = 'mcp';

-- Utility Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sample Data for Testing

-- Create a test user first
INSERT INTO users (email, name, credits, status) VALUES
('test@example.com', 'Test User', 1000.00, 'active'),
('mcp-provider@example.com', 'MCP Provider', 500.00, 'active');

-- LLM Gateway Sample Data (Existing)
INSERT INTO vendors (name, base_url, api_key_encrypted, default_headers) VALUES
('OpenAI', 'https://api.openai.com', 'encrypted_key_here', '{"Content-Type": "application/json"}'),
('Anthropic', 'https://api.anthropic.com', 'encrypted_key_here', '{"Content-Type": "application/json", "anthropic-version": "2023-06-01"}');

INSERT INTO apis (vendor_id, name, endpoint, method, cost_per_call, description) VALUES
((SELECT id FROM vendors WHERE name = 'OpenAI'), 'GPT-4', '/v1/chat/completions', 'POST', 0.03, 'GPT-4 Chat Completions'),
((SELECT id FROM vendors WHERE name = 'OpenAI'), 'GPT-3.5', '/v1/chat/completions', 'POST', 0.002, 'GPT-3.5 Turbo Chat Completions'),
((SELECT id FROM vendors WHERE name = 'Anthropic'), 'Claude-3', '/v1/messages', 'POST', 0.015, 'Claude-3 Messages API');

-- MCP Gateway Sample Data (New)
INSERT INTO mcp_servers (server_id, provider_id, https_url, name, description, published, free_requests_per_day, auth_type, auth_config) VALUES
('example-weather', (SELECT id FROM users WHERE email = 'mcp-provider@example.com'), 'https://api.example-weather.com', 'Example Weather Server', 'Demo MCP server for weather data', true, 100, 'bearer', '{"header_name": "Authorization", "token_prefix": "Bearer"}'),
('demo-calculator', (SELECT id FROM users WHERE email = 'mcp-provider@example.com'), 'https://api.demo-calculator.com', 'Demo Calculator Server', 'Basic math operations MCP server', true, 50, 'none', '{}'),
('file-operations', (SELECT id FROM users WHERE email = 'mcp-provider@example.com'), 'https://api.file-ops.com', 'File Operations Server', 'File manipulation and processing tools', true, 25, 'api_key', '{"header_name": "X-API-Key"}');

-- Tool pricing for sample MCP servers
INSERT INTO tool_pricing (server_id, tool_name, cost_per_call, description) VALUES
-- Weather server tools
((SELECT id FROM mcp_servers WHERE server_id = 'example-weather'), 'get_current_weather', 0.005, 'Get current weather for a location'),
((SELECT id FROM mcp_servers WHERE server_id = 'example-weather'), 'get_forecast', 0.01, 'Get weather forecast for a location'),
((SELECT id FROM mcp_servers WHERE server_id = 'example-weather'), 'get_historical_weather', 0.008, 'Get historical weather data'),

-- Calculator server tools
((SELECT id FROM mcp_servers WHERE server_id = 'demo-calculator'), 'calculate', 0.001, 'Perform basic mathematical calculations'),
((SELECT id FROM mcp_servers WHERE server_id = 'demo-calculator'), 'convert_units', 0.002, 'Convert between different units'),
((SELECT id FROM mcp_servers WHERE server_id = 'demo-calculator'), 'solve_equation', 0.005, 'Solve mathematical equations'),

-- File operations server tools
((SELECT id FROM mcp_servers WHERE server_id = 'file-operations'), 'read_file', 0.003, 'Read file contents'),
((SELECT id FROM mcp_servers WHERE server_id = 'file-operations'), 'write_file', 0.004, 'Write data to file'),
((SELECT id FROM mcp_servers WHERE server_id = 'file-operations'), 'list_directory', 0.002, 'List directory contents'),
((SELECT id FROM mcp_servers WHERE server_id = 'file-operations'), 'compress_file', 0.006, 'Compress files');

-- Create sample API keys for testing
INSERT INTO api_keys (user_id, key_hash, key_prefix, name, status) VALUES
((SELECT id FROM users WHERE email = 'test@example.com'),
 '$2b$10$example_hash_for_test_user_key_here',
 'zup_test',
 'Test API Key',
 'active'),
((SELECT id FROM users WHERE email = 'mcp-provider@example.com'),
 '$2b$10$example_hash_for_provider_key_here',
 'zup_prov',
 'MCP Provider Key',
 'active');