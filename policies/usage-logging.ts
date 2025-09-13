import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function usageLogging(
  request: ZuploRequest,
  context: ZuploContext,
  policyName: string,
  response: Response
) {
  try {
    const user = context.custom.user;
    const api = context.custom.api;
    const requestId = context.custom.requestId;
    const requestStartTime = context.custom.requestStartTime;

    if (!user || !api || !requestId || !requestStartTime) {
      context.log.warn('Missing context for usage logging', {
        hasUser: !!user,
        hasApi: !!api,
        hasRequestId: !!requestId,
        hasStartTime: !!requestStartTime
      });
      return response;
    }

    const latency = Date.now() - requestStartTime;

    // Log usage asynchronously to avoid blocking the response
    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;

    // Don't await this to avoid blocking the response
    fetch(`${controlPlaneUrl}/usage/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        api_id: api.api_id,
        request_id: requestId,
        status: response.ok ? 'success' : 'failed',
        response_status: response.status,
        latency_ms: latency
      })
    }).catch(error => {
      context.log.error('Usage logging failed:', error);
    });

    // Add custom headers to response
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'X-Request-ID': requestId,
        'X-Credits-Used': response.ok ? api.cost.toString() : '0',
        'X-Latency-MS': latency.toString()
      }
    });

    return newResponse;
  } catch (error) {
    context.log.error('Usage logging policy error:', error);
    return response;
  }
}