import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase function environment configuration.");
}

const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await adminSupabase.auth.getUser(token);

    if (authError || !user?.id) {
      return jsonResponse(
        {
          error: "Could not authenticate request.",
          details: authError?.message ?? "Missing user.",
        },
        401
      );
    }

    const { error: profileDeleteError } = await adminSupabase
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileDeleteError) {
      return jsonResponse(
        {
          error: "Could not delete profile.",
          details: profileDeleteError.message,
        },
        500
      );
    }

    const { error: deleteUserError } = await adminSupabase.auth.admin.deleteUser(
      user.id
    );

    if (deleteUserError) {
      return jsonResponse(
        {
          error: "Could not delete auth account.",
          details: deleteUserError.message,
        },
        500
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected delete-account failure.",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
