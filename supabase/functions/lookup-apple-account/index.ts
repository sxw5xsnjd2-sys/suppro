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

function isLikelyEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function extractBearerToken(req: Request) {
  const authorization =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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

function getAuthenticatedAppleAccount(user: Record<string, unknown>) {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const appleIds = new Set<string>();
  const appleEmails = new Set<string>();

  for (const identity of identities) {
    if (!identity || typeof identity !== "object") {
      continue;
    }

    const identityRecord = identity as Record<string, unknown>;
    if (trimString(identityRecord.provider) !== "apple") {
      continue;
    }

    const identityData =
      identityRecord.identity_data &&
      typeof identityRecord.identity_data === "object"
        ? (identityRecord.identity_data as Record<string, unknown>)
        : null;

    [
      trimString(identityRecord.id),
      trimString(identityRecord.identity_id),
      trimString(identityRecord.user_id),
      trimString(identityData?.sub),
    ]
      .filter(Boolean)
      .forEach((candidateId) => appleIds.add(candidateId));

    const identityEmail = normalizeEmail(identityData?.email);
    if (identityEmail) {
      appleEmails.add(identityEmail);
    }
  }

  const userEmail = normalizeEmail(user.email);
  if (userEmail && userHasAppleProvider(user)) {
    appleEmails.add(userEmail);
  }

  return {
    hasAppleProvider: userHasAppleProvider(user),
    appleIds,
    appleEmails,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const requestBody = await req.json().catch(() => null);
    if (
      !requestBody ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody)
    ) {
      return jsonResponse({ error: "Invalid request payload." }, 400);
    }

    const request = requestBody as Record<string, unknown>;
    const appleUserId = trimString(request.appleUserId);
    const email = normalizeEmail(request.email);

    if (!appleUserId && !email) {
      return jsonResponse(
        { error: "appleUserId or email is required." },
        400
      );
    }

    if (email && !isLikelyEmail(email)) {
      return jsonResponse({ error: "Invalid email." }, 400);
    }

    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const { data, error } = await adminSupabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const authenticatedAccount = getAuthenticatedAppleAccount(
      data.user as Record<string, unknown>
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
