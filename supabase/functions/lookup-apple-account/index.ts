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

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return trimString(value).toLowerCase();
}

function isAppleIdentityMatch(
  identity: Record<string, unknown> | null | undefined,
  appleUserId: string,
  email: string
) {
  if (!identity || trimString(identity.provider) !== "apple") {
    return false;
  }

  const identityData =
    identity.identity_data && typeof identity.identity_data === "object"
      ? (identity.identity_data as Record<string, unknown>)
      : null;

  const candidateIds = [
    trimString(identity.id),
    trimString(identity.identity_id),
    trimString(identity.user_id),
    trimString(identityData?.sub),
  ].filter(Boolean);

  if (appleUserId && candidateIds.includes(appleUserId)) {
    return true;
  }

  if (!email) {
    return false;
  }

  const identityEmail = normalizeEmail(identityData?.email);
  return identityEmail === email;
}

function userHasAppleProvider(user: Record<string, unknown>) {
  const identities = Array.isArray(user.identities) ? user.identities : [];

  if (
    identities.some(
      (identity) =>
        identity &&
        typeof identity === "object" &&
        trimString((identity as Record<string, unknown>).provider) === "apple"
    )
  ) {
    return true;
  }

  const appMetadata =
    user.app_metadata && typeof user.app_metadata === "object"
      ? (user.app_metadata as Record<string, unknown>)
      : null;
  const providers = Array.isArray(appMetadata?.providers)
    ? appMetadata.providers
    : [];

  return providers.some((provider) => trimString(provider) === "apple");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const requestBody = await req.json().catch(() => ({}));
    const appleUserId = trimString(requestBody?.appleUserId);
    const email = normalizeEmail(requestBody?.email);

    if (!appleUserId && !email) {
      return jsonResponse(
        { error: "appleUserId or email is required." },
        400
      );
    }

    let page = 1;

    while (true) {
      const { data, error } = await adminSupabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });

      if (error) {
        return jsonResponse(
          {
            error: "Could not verify Apple account.",
            details: error.message,
          },
          500
        );
      }

      const users = data?.users ?? [];
      const matchingUser = users.find((user) => {
        const userEmail = normalizeEmail(user.email);
        const identities = Array.isArray(user.identities) ? user.identities : [];

        const identityMatch = identities.some((identity) =>
          isAppleIdentityMatch(
            identity as Record<string, unknown>,
            appleUserId,
            email
          )
        );

        if (identityMatch) {
          return true;
        }

        return email ? userEmail === email && userHasAppleProvider(user) : false;
      });

      if (matchingUser?.id) {
        return jsonResponse({ exists: true, userId: matchingUser.id });
      }

      if (!data?.nextPage || users.length === 0 || page >= data.lastPage) {
        break;
      }

      page = data.nextPage;
    }

    return jsonResponse({ exists: false });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected Apple account lookup failure.",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
