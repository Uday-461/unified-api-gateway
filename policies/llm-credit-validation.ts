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

    if (!vendor || !model) {
      return new Response(
        JSON.stringify({
          error: 'Invalid path format',
          expected: '/api/v1/{vendor}/{model}',
          available: 'openai/gpt-4, openai/gpt-3.5, anthropic/claude-3'
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

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
      const error = await response.json().catch(() => ({
        error: 'Credit validation failed'
      }));
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