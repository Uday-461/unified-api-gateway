import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function vendorProxy(
  request: ZuploRequest,
  context: ZuploContext
) {
  try {
    const user = context.custom.user;
    const api = context.custom.api;

    if (!user || !api) {
      throw new Error('Missing user or API context');
    }

    // Get request body
    const requestBody = await request.text();

    // Prepare vendor request headers
    const vendorHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api.api_key}`,
      ...api.vendor_headers
    };

    // Remove any undefined or null headers
    Object.keys(vendorHeaders).forEach(key => {
      if (vendorHeaders[key] === undefined || vendorHeaders[key] === null) {
        delete vendorHeaders[key];
      }
    });

    context.log.info('Proxying to vendor', {
      vendor_url: api.vendor_url,
      method: request.method,
      user_id: user.userId
    });

    // Proxy to vendor API
    const vendorResponse = await fetch(api.vendor_url, {
      method: request.method,
      headers: vendorHeaders,
      body: requestBody
    });

    const responseBody = await vendorResponse.text();

    // Return vendor response with original headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': vendorResponse.headers.get('Content-Type') || 'application/json'
    };

    // Preserve important vendor headers
    const headersToPreserve = [
      'content-type',
      'content-length',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset'
    ];

    headersToPreserve.forEach(headerName => {
      const value = vendorResponse.headers.get(headerName);
      if (value) {
        responseHeaders[headerName] = value;
      }
    });

    return new Response(responseBody, {
      status: vendorResponse.status,
      statusText: vendorResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    context.log.error('Vendor proxy error:', error);
    return new Response(
      JSON.stringify({
        error: 'Proxy request failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}