import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);

  const publishableKeys = Object.values(
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")
  ) as string[];
  const apiKey = req.headers.get("apikey") || "";
  if (!apiKey || !publishableKeys.includes(apiKey)) {
    return respond({ error: "Invalid Recode client key" }, 401);
  }

  const body = await req.json().catch(() => null) as
    | Record<string, unknown>
    | null;
  const profileId =
    body && typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    return respond({ error: "Invalid profile id" }, 400);
  }

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey =
    secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secretKey) return respond({ error: "Hub backend not configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey);
  const { data, error } = await supabase.rpc("recode_increment_download", {
    profile_id: profileId
  });

  if (error) return respond({ error: "Could not record download" }, 500);
  return respond({ ok: true, downloads: data ?? null });
});
