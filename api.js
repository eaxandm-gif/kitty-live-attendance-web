const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxdbCqBI3HRDfeyil5WJRSvrKbKHf8KlMejlGLy3bw1qVEFSxtHspxAAGOUKVImc2zumQ/exec';

export async function onRequestPost({ request }) {
  try {
    const body = await request.text();
    const upstream = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'follow'
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'PROXY_ERROR',
      message: error && error.message ? error.message : 'Cloudflare proxy failed'
    }, { status: 502 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
