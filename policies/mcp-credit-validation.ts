import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function mcpCreditValidation(
  request: ZuploRequest,
  context: ZuploContext
): Promise<any> {
  try {
    const user = context.custom.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User context not found' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Extract server ID from path: /api/mcp/{serverId}
    const pathParts = new URL(request.url).pathname.split('/');
    const serverId = pathParts[3];

    if (!serverId) {
      return new Response(
        JSON.stringify({
          error: 'Invalid path format',
          expected: '/api/mcp/{serverId}',
          available: 'Get available servers at /api/mcp/servers'
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Extract tool name from request body
    let toolName: string;
    try {
      const requestBody = await request.text();
      const body = JSON.parse(requestBody);
      toolName = body?.params?.name;

      if (!toolName) {
        return new Response(
          JSON.stringify({
            error: 'Tool name required',
            required_format: {
              method: 'tools/call',
              params: {
                name: 'tool_name',
                arguments: {}
              }
            }
          }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }

      // Store the original request body for later use
      context.custom.requestBody = requestBody;
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON in request body'
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/api/mcp/credit/validate/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        server_id: serverId,
        tool_name: toolName
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'MCP credit validation failed'
      }));
      return new Response(
        JSON.stringify(error),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }

    const creditData = await response.json();

    // Store MCP context for downstream policies
    context.custom.mcp = {
      ...creditData,
      serverId,
      toolName
    };

    context.log.info('MCP credit validation passed', {
      userId: user.userId,
      serverId,
      toolName,
      cost: creditData.cost,
      isFreeRequest: creditData.is_free_request
    });

    return request;
  } catch (error) {
    context.log.error('MCP credit validation error:', error);
    return new Response(
      JSON.stringify({ error: 'MCP credit validation failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}