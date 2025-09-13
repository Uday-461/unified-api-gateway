import { ZuploRequest, ZuploContext } from '@zuplo/runtime';

export async function getCreditBalance(
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

    const controlPlaneUrl = context.environment.CONTROL_PLANE_URL;
    const response = await fetch(`${controlPlaneUrl}/user/${user.userId}/credits`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Failed to fetch credit balance'
      }));
      return new Response(
        JSON.stringify(error),
        { status: response.status, headers: { 'content-type': 'application/json' } }
      );
    }

    const creditData = await response.json();

    return new Response(
      JSON.stringify({
        user_id: user.userId,
        email: user.userEmail,
        credits: creditData.credits
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    context.log.error('Get credit balance error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get credit balance' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}