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

function errorResponse(code: string, error: string, status: number) {
  return jsonResponse({ code, error }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Method not allowed.", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(
        "auth_required",
        "You must be signed in to delete your account.",
        401
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return errorResponse(
        "auth_required",
        "You must be signed in to delete your account.",
        401
      );
    }

    const {
      data: { user },
      error: authError,
    } = await adminSupabase.auth.getUser(token);

    if (authError || !user?.id || user.is_anonymous === true) {
      return errorResponse(
        "auth_required",
        "You must be signed in to delete your account.",
        401
      );
    }

    const { error: completionDeleteError } = await adminSupabase
      .from("account_setup_completions")
      .delete()
      .eq("user_id", user.id);

    if (completionDeleteError) {
      return errorResponse(
        "delete_failed",
        "Could not delete your account. Please try again.",
        500
      );
    }

    const { error: profileDeleteError } = await adminSupabase
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileDeleteError) {
      return errorResponse(
        "delete_failed",
        "Could not delete your account. Please try again.",
        500
      );
    }

    const { error: quotaDeleteError } = await adminSupabase
      .from("edge_function_quotas")
      .delete()
      .eq("user_id", user.id);

    if (quotaDeleteError) {
      return errorResponse(
        "delete_failed",
        "Could not delete your account. Please try again.",
        500
      );
    }

    const { error: deleteUserError } = await adminSupabase.auth.admin.deleteUser(
      user.id
    );

    if (deleteUserError) {
      return errorResponse(
        "delete_failed",
        "Could not delete your account. Please try again.",
        500
      );
    }

    return jsonResponse({ success: true });
  } catch {
    console.error("[delete-account] Unexpected delete-account failure.");
    return errorResponse(
      "delete_failed",
      "Could not delete your account. Please try again.",
      500
    );
  }
});
