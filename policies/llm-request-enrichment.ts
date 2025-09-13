import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export default async function requestEnrichment(
  request: ZuploRequest,
  context: ZuploContext
) {
  try {
    const user = context.custom.user;
    const api = context.custom.api;

    if (!user || !api) {
      return new Response(
        JSON.stringify({ error: 'Missing user or API context' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Store additional context for logging
    context.custom.requestStartTime = Date.now();
    context.custom.requestId = crypto.randomUUID();

    // Log the incoming request
    context.log.info('Request received', {
      userId: user.userId,
      userEmail: user.userEmail,
      apiId: api.api_id,
      cost: api.cost,
      requestId: context.custom.requestId
    });

    return request;
  } catch (error) {
    context.log.error('Request enrichment error:', error);
    return new Response(
      JSON.stringify({ error: 'Request processing failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}