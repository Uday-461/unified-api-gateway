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
      const errorData = await response.json().catch(() => ({ error: 'Invalid API key' }));
      return new Response(
        JSON.stringify(errorData),
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