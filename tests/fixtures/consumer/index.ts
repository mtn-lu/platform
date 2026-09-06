export default {
  async fetch(request: Request, env: ConsumerEnv): Promise<Response> {
    const user = await env.AUTH.validateSession(
      request.headers.get("cookie") ?? "",
    );
    return Response.json(
      { user },
      { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } },
    );
  },
} satisfies ExportedHandler<ConsumerEnv>;
