import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('API Gateway', () => {
  const BASE_URL = 'http://localhost:9000'; // Zuplo local dev URL
  const CONTROL_PLANE_URL = 'http://localhost:3000';

  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Health Check', () => {
    it('should return health status from control plane', async () => {
      const response = await fetch(`${CONTROL_PLANE_URL}/health`);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.service).toBe('api-gateway-control-plane');
    });
  });

  describe('API Key Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/openai/gpt-4`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('API key required');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/openai/gpt-4`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'invalid_key'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Credit Validation', () => {
    it('should return error for unknown API endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/unknown/model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'zup_test_key_no_credits'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      expect(response.status).toBe(404);
    });

    it('should validate path format', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/openai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'zup_test_key'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Invalid path format');
    });
  });

  describe('Control Plane API', () => {
    describe('Auth Validation', () => {
      it('should validate API key format', async () => {
        const response = await fetch(`${CONTROL_PLANE_URL}/auth/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        expect(response.status).toBe(401);
        const data = await response.json() as any;
        expect(data.error).toBe('API key required');
      });
    });

    describe('Credit Validation', () => {
      it('should handle missing parameters', async () => {
        const response = await fetch(`${CONTROL_PLANE_URL}/credit/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(404);
      });
    });

    describe('Usage Logging', () => {
      it('should handle missing parameters', async () => {
        const response = await fetch(`${CONTROL_PLANE_URL}/usage/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(500);
      });
    });
  });
});