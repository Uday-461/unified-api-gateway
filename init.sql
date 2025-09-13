-- API Gateway Database Schema
-- PostgreSQL 15+ compatible

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