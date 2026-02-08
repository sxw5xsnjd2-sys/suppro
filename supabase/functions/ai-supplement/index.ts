import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const responseSchema = {
  name: "stats_daily_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "A concise summary of adherence, evidence quality, and metric trends over the reported period.",
      },
      recommendations: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "string",
          description:
            "Generic recommendation that does not mention specific supplement names.",
        },
      },
    },
    required: ["summary", "recommendations"],
    additionalProperties: false,
  },
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function sanitizeRecommendations(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const openAiApiKey = Deno.env.get("OPENAI_API_KEY")
  const openAiModel = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini"

  if (!openAiApiKey) {
    return jsonResponse(
      {
        error: "Missing OPENAI_API_KEY secret for ai-supplement function.",
      },
      500,
    )
  }

  try {
    const body = await req.json()
    const stats = body?.stats
    const generatedForDate = typeof body?.generatedForDate === "string"
      ? body.generatedForDate
      : "today"

    if (!stats || typeof stats !== "object") {
      return jsonResponse({ error: "Missing stats payload." }, 400)
    }

    const systemPrompt = `
You are generating an AI summary for a supplements stats dashboard.
Requirements:
- Explain adherence, evidence-backing quality, and how tracked metrics have changed over time.
- Keep the summary concise (3-5 sentences), practical, and non-alarmist.
- Recommendations must be generic and must NOT mention specific supplement names.
- Recommendation examples of acceptable style: focus on higher evidence backing, improve schedule consistency, focus on sleep support, focus on stress recovery.
- Use only the provided JSON data. If data is sparse, say so plainly.
`.trim()

    const userPrompt = `
Generate a daily summary for ${generatedForDate}.

Dashboard stats JSON:
${JSON.stringify(stats)}
`.trim()

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        temperature: 0.35,
        response_format: {
          type: "json_schema",
          json_schema: responseSchema,
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    })

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text()
      return jsonResponse(
        {
          error: "OpenAI request failed",
          details: errorText.slice(0, 400),
        },
        502,
      )
    }

    const completion = await openAiResponse.json()
    const rawContent = completion?.choices?.[0]?.message?.content
    const content = typeof rawContent === "string"
      ? rawContent.trim()
      : Array.isArray(rawContent)
      ? rawContent
        .map((part) => {
          if (typeof part?.text === "string") return part.text
          if (typeof part?.content === "string") return part.content
          return ""
        })
        .join("")
        .trim()
      : ""

    if (!content) {
      return jsonResponse({ error: "OpenAI returned empty content." }, 502)
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      return jsonResponse(
        { error: "Could not parse OpenAI JSON response.", content },
        502,
      )
    }

    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : ""
    if (!summary) {
      return jsonResponse({ error: "OpenAI response missing summary text." }, 502)
    }

    const recommendations = sanitizeRecommendations(parsed?.recommendations)

    return jsonResponse({
      summary,
      recommendations,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected ai-supplement failure",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
})
