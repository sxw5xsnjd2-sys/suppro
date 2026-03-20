import { getScopedSupabase, supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasUserSupplementDetails(row) {
  return Boolean(
    trimString(row?.what_is_it) ||
      trimString(row?.why_use_it) ||
      trimString(row?.risks_and_interactions) ||
      trimString(row?.evidence_summary)
  );
}

function isMissingOrCustomCatalogId(catalogId) {
  return !catalogId || String(catalogId).startsWith("custom-");
}

function getUserCatalogRecordId(catalogId) {
  return typeof catalogId === "string" && catalogId.startsWith("user-")
    ? catalogId.replace(/^user-/, "")
    : null;
}

export async function reconcileSupplementCatalogIds(supplements) {
  const rows = Array.isArray(supplements) ? supplements : [];
  if (!rows.length) return null;

  const userCatalogIds = Array.from(
    new Set(
      rows
        .map((row) => getUserCatalogRecordId(row?.catalogId))
        .filter(Boolean)
    )
  );

  const placeholderUserIds = new Set();

  if (userCatalogIds.length) {
    const scopedSupabase = await getScopedSupabase();
    const { data, error } = await scopedSupabase
      .from("user_supplements")
      .select(
        "id, what_is_it, why_use_it, risks_and_interactions, evidence_summary"
      )
      .in("id", userCatalogIds);

    if (error) {
      console.error("Failed to inspect persisted user supplements", error);
    } else {
      (data ?? []).forEach((row) => {
        if (!hasUserSupplementDetails(row) && row?.id) {
          placeholderUserIds.add(row.id);
        }
      });
    }
  }

  const candidateNames = Array.from(
    new Set(
      rows
        .filter((row) => {
          const name = trimString(row?.name);
          if (!name) return false;
          if (isMissingOrCustomCatalogId(row?.catalogId)) return true;

          const userCatalogRecordId = getUserCatalogRecordId(row?.catalogId);
          return Boolean(
            userCatalogRecordId && placeholderUserIds.has(userCatalogRecordId)
          );
        })
        .map((row) => trimString(row?.name))
    )
  );

  if (!candidateNames.length) return null;

  const { data, error } = await supabase
    .from("supplements")
    .select("id, name")
    .eq("status", "approved")
    .in("name", candidateNames);

  if (error) {
    console.error("Failed to reconcile persisted supplement catalog IDs", error);
    return null;
  }

  const countsByName = {};
  (data ?? []).forEach((row) => {
    const name = trimString(row?.name);
    if (!name) return;
    countsByName[name] = (countsByName[name] ?? 0) + 1;
  });

  const officialIdByName = {};
  (data ?? []).forEach((row) => {
    const name = trimString(row?.name);
    if (!name || countsByName[name] !== 1 || !row?.id) return;
    officialIdByName[name] = row.id;
  });

  let didChange = false;
  const reconciled = rows.map((row) => {
    const name = trimString(row?.name);
    const officialId = officialIdByName[name];
    if (!officialId) return row;

    if (row?.catalogId === officialId) return row;

    if (isMissingOrCustomCatalogId(row?.catalogId)) {
      didChange = true;
      return { ...row, catalogId: officialId };
    }

    const userCatalogRecordId = getUserCatalogRecordId(row?.catalogId);
    if (userCatalogRecordId && placeholderUserIds.has(userCatalogRecordId)) {
      didChange = true;
      return { ...row, catalogId: officialId };
    }

    return row;
  });

  return didChange ? reconciled : null;
}
