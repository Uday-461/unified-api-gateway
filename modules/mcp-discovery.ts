import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export async function listMCPServers(
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  try {
    const user = context.custom.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User context not found' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/api/mcp/servers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Failed to fetch MCP servers'
      }));
      return new Response(
        JSON.stringify(error),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }

    const serversData = await response.json();

    // Enrich response with user context
    const enrichedResponse = {
      ...serversData,
      user_id: user.userId,
      available_credits: user.credits,
      note: 'Use /api/mcp/server/{serverId}/info to get detailed tool information'
    };

    return new Response(
      JSON.stringify(enrichedResponse),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    context.log.error('List MCP servers error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to list MCP servers' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export async function getMCPServerInfo(
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  try {
    const user = context.custom.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User context not found' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Extract server ID from path
    const pathParts = new URL(request.url).pathname.split('/');
    const serverId = pathParts[4]; // /api/mcp/server/{serverId}/info

    if (!serverId) {
      return new Response(
        JSON.stringify({ error: 'Server ID required' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/api/mcp/server/${serverId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'MCP server not found or unavailable'
      }));
      return new Response(
        JSON.stringify(error),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }

    const serverData = await response.json();

    // Enrich response with usage examples and user context
    const enrichedResponse = {
      ...serverData,
      user_context: {
        user_id: user.userId,
        available_credits: user.credits
      },
      usage_examples: serverData.tools?.map((tool: any) => ({
        tool_name: tool.tool_name,
        cost_per_call: tool.cost_per_call,
        description: tool.description,
        example_request: {
          method: 'POST',
          url: `/api/mcp/${serverId}`,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key_here'
          },
          body: {
            method: 'tools/call',
            params: {
              name: tool.tool_name,
              arguments: getExampleArguments(tool.tool_name)
            }
          }
        }
      })) || []
    };

    return new Response(
      JSON.stringify(enrichedResponse),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    context.log.error('Get MCP server info error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get MCP server information' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

// Helper function to provide example arguments for common tools
function getExampleArguments(toolName: string): Record<string, any> {
  const examples: Record<string, Record<string, any>> = {
    'get_current_weather': {
      location: 'San Francisco, CA',
      units: 'metric'
    },
    'get_forecast': {
      location: 'New York, NY',
      days: 3
    },
    'get_historical_weather': {
      location: 'London, UK',
      date: '2024-01-01'
    },
    'calculate': {
      expression: '2 + 2 * 3'
    },
    'convert_units': {
      value: 100,
      from_unit: 'celsius',
      to_unit: 'fahrenheit'
    },
    'solve_equation': {
      equation: 'x^2 + 5x + 6 = 0'
    },
    'read_file': {
      path: '/path/to/file.txt'
    },
    'write_file': {
      path: '/path/to/output.txt',
      content: 'Hello, world!'
    },
    'list_directory': {
      path: '/path/to/directory'
    },
    'compress_file': {
      input_path: '/path/to/file.txt',
      output_path: '/path/to/file.zip'
    }
  };

  return examples[toolName] || {
    example: 'Please refer to the tool documentation for required arguments'
  };
}