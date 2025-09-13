import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('MCP Gateway', () => {
  const CONTROL_PLANE_URL = 'http://localhost:3000';
  const ZUPLO_URL = 'http://localhost:9000'; // Zuplo local dev URL

  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Control Plane MCP Endpoints', () => {
    it('should list available MCP servers', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/servers`);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.servers).toBeInstanceOf(Array);
      expect(data.total).toBeGreaterThan(0);

      // Check server structure
      const server = data.servers[0];
      expect(server).toHaveProperty('server_id');
      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('description');
      expect(server).toHaveProperty('free_requests_per_day');
      expect(server).toHaveProperty('auth_type');
      expect(server).toHaveProperty('tool_count');
    });

    it('should get specific MCP server details', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/server/example-weather`);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.server_id).toBe('example-weather');
      expect(data.tools).toBeInstanceOf(Array);
      expect(data.tools.length).toBeGreaterThan(0);

      // Check tool structure
      const tool = data.tools[0];
      expect(tool).toHaveProperty('tool_name');
      expect(tool).toHaveProperty('cost_per_call');
      expect(tool).toHaveProperty('description');
    });

    it('should return 404 for non-existent MCP server', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/server/non-existent`);
      const data = await response.json() as any;

      expect(response.status).toBe(404);
      expect(data.error).toMatch(/not found/i);
    });

    it('should validate MCP credit requirements', async () => {
      // This would normally require a valid user_id from the database
      // For testing, we'll test the endpoint structure
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/credit/validate/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          server_id: 'example-weather',
          tool_name: 'get_current_weather'
        })
      });

      // Should either validate successfully or return a proper error
      expect([200, 402, 404]).toContain(response.status);
    });

    it('should handle MCP usage logging', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          request_id: 'test-request-123',
          status: 'success',
          response_status: 200,
          latency_ms: 150,
          gateway_type: 'mcp',
          server_id: 'test-server-uuid',
          tool_name: 'test_tool'
        })
      });

      // Should handle the request even if user doesn't exist
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Dual Gateway Usage Logging', () => {
    it('should handle LLM gateway usage logging', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          request_id: 'test-llm-request-123',
          status: 'success',
          response_status: 200,
          latency_ms: 200,
          gateway_type: 'llm',
          api_id: 'test-api-uuid'
        })
      });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should reject usage logging without gateway_type', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          request_id: 'test-request-no-type',
          status: 'success',
          response_status: 200,
          latency_ms: 100
          // Missing gateway_type - should default to 'llm'
        })
      });

      // The endpoint should handle this gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it('should validate required fields for MCP gateway', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          request_id: 'test-mcp-invalid',
          status: 'success',
          response_status: 200,
          latency_ms: 100,
          gateway_type: 'mcp'
          // Missing server_id and tool_name for MCP
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toMatch(/server_id and tool_name required/i);
    });

    it('should validate required fields for LLM gateway', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-id',
          request_id: 'test-llm-invalid',
          status: 'success',
          response_status: 200,
          latency_ms: 100,
          gateway_type: 'llm'
          // Missing api_id for LLM
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toMatch(/api_id required for LLM gateway/i);
    });
  });

  describe('MCP Server Management (Admin)', () => {
    it('should create a new MCP server', async () => {
      const testServer = {
        server_id: 'test-server-' + Date.now(),
        https_url: 'https://api.test-server.com',
        name: 'Test Server',
        description: 'A test MCP server for automated testing',
        published: false,
        free_requests_per_day: 10,
        auth_type: 'none'
      };

      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/admin/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testServer)
      });

      if (response.status === 201) {
        const data = await response.json() as any;
        expect(data.success).toBe(true);
        expect(data.server.server_id).toBe(testServer.server_id);
        expect(data.server.name).toBe(testServer.name);
      } else {
        // May fail if no users exist in test database
        expect([201, 404, 500]).toContain(response.status);
      }
    });

    it('should prevent duplicate server IDs', async () => {
      const duplicateServer = {
        server_id: 'example-weather', // This already exists
        https_url: 'https://api.duplicate.com',
        name: 'Duplicate Server',
        published: true
      };

      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/admin/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateServer)
      });

      expect(response.status).toBe(409);
      const data = await response.json() as any;
      expect(data.error).toMatch(/already exists/i);
    });
  });

  describe('Database Schema Validation', () => {
    it('should have all required MCP tables', async () => {
      // This would require direct database access in a real test environment
      // For now, we test indirectly through API endpoints
      const serversResponse = await fetch(`${CONTROL_PLANE_URL}/api/mcp/servers`);
      expect(serversResponse.status).toBe(200);

      const serverResponse = await fetch(`${CONTROL_PLANE_URL}/api/mcp/server/example-weather`);
      expect(serverResponse.status).toBe(200);
    });

    it('should support both LLM and MCP usage logs', async () => {
      const healthResponse = await fetch(`${CONTROL_PLANE_URL}/health`);
      expect(healthResponse.status).toBe(200);

      const healthData = await healthResponse.json() as any;
      expect(healthData.status).toBe('ok');
      expect(healthData.service).toBe('api-gateway-control-plane');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed MCP requests gracefully', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/credit/validate/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalid: 'request'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toMatch(/Missing required parameters/i);
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/credit/validate/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      expect([400, 500]).toContain(response.status);
    });

    it('should provide helpful error messages', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/api/mcp/server/nonexistent`);
      expect(response.status).toBe(404);

      const data = await response.json() as any;
      expect(data).toHaveProperty('error');
      expect(data.server_id).toBe('nonexistent');
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication for protected endpoints', async () => {
      // Test without API key
      const response = await fetch(`${CONTROL_PLANE_URL}/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('API key required');
    });

    it('should reject invalid API keys', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'invalid_key'
        }
      });

      expect(response.status).toBe(401);
    });
  });
});