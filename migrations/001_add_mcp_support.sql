-- Migration: Add MCP Gateway Support
-- This extends the existing LLM Gateway database schema to support MCP servers

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
CREATE INDEX idx_mcp_servers_provider ON mcp_servers(provider_id);
CREATE INDEX idx_tool_pricing_server_tool ON tool_pricing(server_id, tool_name);
CREATE INDEX idx_daily_usage_user_server_date ON daily_free_usage(user_id, server_id, date);
CREATE INDEX idx_usage_logs_gateway_type ON usage_logs(gateway_type, created_at DESC);
CREATE INDEX idx_usage_logs_server_date ON usage_logs(server_id, created_at DESC) WHERE gateway_type = 'mcp';

-- Add sample MCP servers for testing
INSERT INTO mcp_servers (server_id, provider_id, https_url, name, description, published, free_requests_per_day, auth_type) VALUES
('example-weather', (SELECT id FROM users WHERE email = 'test@example.com' LIMIT 1), 'https://api.example-weather.com', 'Example Weather Server', 'Demo MCP server for weather data', true, 100, 'bearer'),
('demo-calculator', (SELECT id FROM users WHERE email = 'test@example.com' LIMIT 1), 'https://api.demo-calculator.com', 'Demo Calculator Server', 'Basic math operations MCP server', true, 50, 'none');

-- Add tool pricing for sample servers
INSERT INTO tool_pricing (server_id, tool_name, cost_per_call, description) VALUES
((SELECT id FROM mcp_servers WHERE server_id = 'example-weather'), 'get_current_weather', 0.005, 'Get current weather for a location'),
((SELECT id FROM mcp_servers WHERE server_id = 'example-weather'), 'get_forecast', 0.01, 'Get weather forecast for a location'),
((SELECT id FROM mcp_servers WHERE server_id = 'demo-calculator'), 'calculate', 0.001, 'Perform basic mathematical calculations'),
((SELECT id FROM mcp_servers WHERE server_id = 'demo-calculator'), 'convert_units', 0.002, 'Convert between different units');

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to automatically update updated_at for mcp_servers
CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();