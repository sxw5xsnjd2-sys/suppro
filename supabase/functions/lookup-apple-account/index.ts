import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateSupabaseUser } from "../_shared/revenuecat.ts";
import {
  getAuthenticatedAppleAccount,
  validateLookupAppleAccountRequest,
} from "../_shared/lookup-apple-account-policy.js";

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
    const validatedRequest = validateLookupAppleAccountRequest(await req.text());
    if (!validatedRequest.ok) {
      return jsonResponse(validatedRequest.body, validatedRequest.status);
    }

    const { appleUserId, email } = validatedRequest.value;
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    const authenticatedUser = await authenticateSupabaseUser({
      adminSupabase,
      authHeader,
    });

    if (!authenticatedUser.ok) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const authenticatedAccount = getAuthenticatedAppleAccount(
      authenticatedUser.user as Record<string, unknown>
    );

    if (!authenticatedAccount.hasAppleProvider) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    const matchesAuthenticatedAppleAccount =
      (appleUserId && authenticatedAccount.appleIds.has(appleUserId)) ||
      (email && authenticatedAccount.appleEmails.has(email));

    if (!matchesAuthenticatedAppleAccount) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    return jsonResponse({ exists: true });
  } catch {
    return jsonResponse({ error: "Unexpected Apple account lookup failure." }, 500);
  }
});
