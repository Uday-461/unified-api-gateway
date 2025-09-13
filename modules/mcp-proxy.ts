import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function mcpProxy(
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  try {
    const user = context.custom.user;
    const mcp = context.custom.mcp;

    if (!user || !mcp) {
      throw new Error('Missing user or MCP context');
    }

    // Get the original request body (stored during credit validation)
    const requestBody = context.custom.requestBody || await request.text();

    // Prepare headers for MCP server
    const mcpHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Zuplo-MCP-Gateway/2.0.0'
    };

    // Add authentication headers based on MCP server configuration
    if (mcp.auth_type === 'bearer' && mcp.auth_config) {
      const headerName = mcp.auth_config.header_name || 'Authorization';
      const tokenPrefix = mcp.auth_config.token_prefix || 'Bearer';

      // In production, you would get the actual token from a secure store
      // For demo purposes, we'll use a placeholder
      mcpHeaders[headerName] = `${tokenPrefix} demo-token-for-${mcp.serverId}`;
    } else if (mcp.auth_type === 'api_key' && mcp.auth_config) {
      const headerName = mcp.auth_config.header_name || 'X-API-Key';

      // In production, you would get the actual API key from a secure store
      // For demo purposes, we'll use a placeholder
      mcpHeaders[headerName] = `demo-api-key-for-${mcp.serverId}`;
    }

    // Add any additional custom headers
    if (mcp.auth_config?.custom_headers) {
      Object.assign(mcpHeaders, mcp.auth_config.custom_headers);
    }

    context.log.info('Proxying to MCP server', {
      server_url: mcp.https_url,
      server_id: mcp.serverId,
      tool_name: mcp.toolName,
      auth_type: mcp.auth_type,
      user_id: user.userId,
      cost: mcp.cost,
      is_free_request: mcp.is_free_request
    });

    // Proxy request to MCP server
    const mcpResponse = await fetch(mcp.https_url, {
      method: 'POST', // MCP servers typically use POST for tool calls
      headers: mcpHeaders,
      body: requestBody
    });

    let responseBody: string;
    try {
      responseBody = await mcpResponse.text();
    } catch (error) {
      context.log.error('Error reading MCP server response:', error);
      responseBody = JSON.stringify({
        error: 'Failed to read response from MCP server'
      });
    }

    // Prepare response headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': mcpResponse.headers.get('Content-Type') || 'application/json'
    };

    // Preserve important MCP server headers
    const headersToPreserve = [
      'content-type',
      'content-length',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-mcp-server-version',
      'x-mcp-protocol-version'
    ];

    headersToPreserve.forEach(headerName => {
      const value = mcpResponse.headers.get(headerName);
      if (value) {
        responseHeaders[headerName] = value;
      }
    });

    // Handle different response scenarios
    if (!mcpResponse.ok) {
      context.log.warn('MCP server returned error', {
        status: mcpResponse.status,
        statusText: mcpResponse.statusText,
        server_id: mcp.serverId,
        tool_name: mcp.toolName
      });
    }

    return new Response(responseBody, {
      status: mcpResponse.status,
      statusText: mcpResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    context.log.error('MCP proxy error:', error);

    // Return structured error response
    const errorResponse = {
      error: 'MCP proxy request failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      server_id: context.custom.mcp?.serverId || 'unknown',
      tool_name: context.custom.mcp?.toolName || 'unknown'
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 502, // Bad Gateway - upstream server error
        headers: {
          'content-type': 'application/json',
          'x-error-type': 'mcp-proxy-error'
        }
      }
    );
  }
}