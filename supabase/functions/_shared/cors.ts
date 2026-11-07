// CORS for browser calls. Every response, errors included, must carry these
// headers, or the browser reports a misleading "CORS error" instead of the real one.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export const preflight = () => new Response('ok', { headers: corsHeaders });
