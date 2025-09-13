import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function mcpRequestEnrichment(
  request: ZuploRequest,
  context: ZuploContext
): Promise<any> {
  try {
    const user = context.custom.user;
    const mcp = context.custom.mcp;

    if (!user || !mcp) {
      return new Response(
        JSON.stringify({ error: 'Missing user or MCP context' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Store additional context for logging and proxying
    context.custom.requestStartTime = Date.now();
    context.custom.requestId = crypto.randomUUID();

    // Log the incoming MCP request
    context.log.info('MCP request received', {
      userId: user.userId,
      userEmail: user.userEmail,
      serverId: mcp.serverId,
      serverUrl: mcp.https_url,
      toolName: mcp.toolName,
      cost: mcp.cost,
      isFreeRequest: mcp.is_free_request,
      authType: mcp.auth_type,
      requestId: context.custom.requestId
    });

    // Add any server-specific enrichment here
    if (mcp.auth_type === 'bearer' && mcp.auth_config?.token_prefix) {
      context.log.info('MCP server requires Bearer token authentication');
    } else if (mcp.auth_type === 'api_key') {
      context.log.info('MCP server requires API key authentication');
    }

    return request;
  } catch (error) {
    context.log.error('MCP request enrichment error:', error);
    return new Response(
      JSON.stringify({ error: 'MCP request processing failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}