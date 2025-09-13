import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function mcpUsageLogging(
  request: ZuploRequest,
  context: ZuploContext,
  policyName: string,
  response: Response
): Promise<Response> {
  try {
    const user = context.custom.user;
    const mcp = context.custom.mcp;
    const requestId = context.custom.requestId;
    const requestStartTime = context.custom.requestStartTime;

    if (!user || !mcp || !requestId || !requestStartTime) {
      context.log.warn('Missing context for MCP usage logging', {
        hasUser: !!user,
        hasMcp: !!mcp,
        hasRequestId: !!requestId,
        hasStartTime: !!requestStartTime
      });
      return response;
    }

    const latency = Date.now() - requestStartTime;

    // Determine if this was an upstream error (MCP server error)
    const isUpstreamError = response.status >= 500 ||
      (response.status >= 400 && response.status !== 401 && response.status !== 402 && response.status !== 403);

    // Log usage asynchronously to avoid blocking the response
    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;

    // Don't await this to avoid blocking the response
    fetch(`${controlPlaneUrl}/usage/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        request_id: requestId,
        status: response.ok ? 'success' : 'failed',
        response_status: response.status,
        latency_ms: latency,
        gateway_type: 'mcp',
        server_id: mcp.server_uuid,
        tool_name: mcp.toolName,
        is_upstream_error: isUpstreamError
      })
    }).catch(error => {
      context.log.error('MCP usage logging failed:', error);
    });

    // Add custom headers to response
    const responseHeaders: Record<string, string> = {};

    // Preserve original headers
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Add MCP-specific headers
    responseHeaders['X-Request-ID'] = requestId;
    responseHeaders['X-Credits-Used'] = response.ok ? mcp.cost.toString() : '0';
    responseHeaders['X-Latency-MS'] = latency.toString();
    responseHeaders['X-Gateway-Type'] = 'mcp';
    responseHeaders['X-Server-ID'] = mcp.serverId;
    responseHeaders['X-Tool-Name'] = mcp.toolName;

    if (mcp.is_free_request) {
      responseHeaders['X-Free-Request'] = 'true';
      responseHeaders['X-Free-Requests-Remaining'] = mcp.free_requests_remaining.toString();
    }

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

    return newResponse;
  } catch (error) {
    context.log.error('MCP usage logging policy error:', error);
    return response;
  }
}