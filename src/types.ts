export interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  status: string;
  created_at: Date;
}

export interface Vendor {
  id: string;
  name: string;
  base_url: string;
  api_key_encrypted: string;
  default_headers: Record<string, string>;
  rate_limit_per_minute: number;
  created_at: Date;
}

export interface Api {
  id: string;
  vendor_id: string;
  name: string;
  endpoint: string;
  method: string;
  cost_per_call: number;
  description: string;
  is_active: boolean;
  created_at: Date;
}

// MCP Server interfaces (New)
export interface MCPServer {
  id: string;
  provider_id: string;
  server_id: string;
  https_url: string;
  name: string;
  description?: string;
  published: boolean;
  free_requests_per_day: number;
  auth_type: 'bearer' | 'api_key' | 'none';
  auth_config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ToolPricing {
  id: string;
  server_id: string;
  tool_name: string;
  cost_per_call: number;
  description?: string;
  created_at: Date;
}

export interface DailyFreeUsage {
  id: string;
  user_id: string;
  server_id: string;
  date: Date;
  usage_count: number;
  created_at: Date;
}

// Enhanced UsageLog to support both LLM and MCP
export interface UsageLog {
  id: string;
  user_id: string;
  request_id: string;
  credits_used: number;
  status: string;
  response_status: number;
  latency_ms: number;

  // LLM Gateway fields (existing)
  api_id?: string;

  // MCP Gateway fields (new)
  server_id?: string;
  tool_name?: string;
  gateway_type: 'llm' | 'mcp';
  is_upstream_error: boolean;

  created_at: Date;
}

export interface AuthResponse {
  valid: boolean;
  user_id: string;
  credits: number;
  context: {
    userId: string;
    userEmail: string;
    credits: number;
  };
}

// LLM Gateway requests (existing)
export interface CreditValidationRequest {
  user_id: string;
  vendor: string;
  model: string;
}

export interface CreditValidationResponse {
  valid: boolean;
  api_id: string;
  cost: number;
  vendor_url: string;
  vendor_headers: Record<string, string>;
  api_key: string;
}

// MCP Gateway requests (new)
export interface MCPCreditValidationRequest {
  user_id: string;
  server_id: string;
  tool_name: string;
}

export interface MCPCreditValidationResponse {
  valid: boolean;
  server_uuid: string;
  server_id: string;
  https_url: string;
  auth_type: string;
  auth_config: Record<string, any>;
  cost: number;
  free_requests_remaining: number;
  is_free_request: boolean;
}

// Enhanced usage logging for both gateways
export interface UsageLogRequest {
  user_id: string;
  request_id: string;
  status: string;
  response_status: number;
  latency_ms: number;
  gateway_type: 'llm' | 'mcp';

  // LLM Gateway fields
  api_id?: string;

  // MCP Gateway fields
  server_id?: string;
  tool_name?: string;
  is_upstream_error?: boolean;
}

// MCP Server management interfaces
export interface CreateMCPServerRequest {
  server_id: string;
  https_url: string;
  name: string;
  description?: string;
  published?: boolean;
  free_requests_per_day?: number;
  auth_type?: 'bearer' | 'api_key' | 'none';
  auth_config?: Record<string, any>;
}

export interface UpdateMCPServerRequest {
  name?: string;
  description?: string;
  https_url?: string;
  published?: boolean;
  free_requests_per_day?: number;
  auth_type?: 'bearer' | 'api_key' | 'none';
  auth_config?: Record<string, any>;
}

export interface SetToolPricingRequest {
  tool_name: string;
  cost_per_call: number;
  description?: string;
}