import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
  StatusPill,
} from "@/components/common/ui";
import { BenefitIconBadge } from "@/features/supplements/components/BenefitIconBadge";
import {
  buildRankedBenefitSupplements,
  getBenefitColor,
  getBenefitIconComponent,
} from "@/features/supplements/benefits";
import { createSupplementProductCatalogId } from "@/features/supplements/catalog";
import { formatProductBenefitScoreText } from "@/features/supplements/productBenefitScoring";
import {
  appendProductRankingPage,
  BENEFIT_RANKING_ENTITY_TYPES,
  getNextProductRankingImageUrl,
  mergeRefreshedProductRankingPage,
  reconcileProductRankingImages,
  resolveBenefitRankingEntityType,
} from "@/features/supplements/productRankingContract";
import {
  getCachedProductRanking,
  setCachedProductRanking,
  updateCachedProductRankingItems,
} from "@/features/supplements/productRankingSessionCache";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { resolveBackNavigationAction } from "@/features/subscriptions/accessPolicy";
import { appTheme, spacing, typography } from "@/theme";
import { getProductBenefitRankingPage } from "@src/data/getProductBenefitRankings";
import {
  enqueueMissingProductImages,
  getMissingProductImageIds,
  getPersistedProductImages,
  PRODUCT_IMAGE_POLL_DELAYS_MS,
  recordPersistedProductImageStates,
} from "@src/lib/productImages";
import { supabase } from "@src/lib/supabase";

function normalizeParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function getProductRankingFailureCopy(reason) {
  if (reason === "rpc_unavailable") {
    return {
      title: "Product rankings unavailable",
      description:
        "The product-ranking database contract is not available on this backend yet. Active ingredient rankings are still available.",
    };
  }
  if (reason === "authentication") {
    return {
      title: "Sign-in required",
      description:
        "Your session could not access product rankings. Sign in again and retry.",
    };
  }
  if (reason === "network") {
    return {
      title: "Product rankings offline",
      description:
        "The ranking service could not be reached. Check your connection and try again.",
    };
  }
  return {
    title: "Ranking unavailable",
    description: "Could not load product rankings for this benefit.",
  };
}

const ProductRankingCard = React.memo(function ProductRankingCard({
  item,
  requireSubscriptionAccess,
}) {
  const [failedImageUrls, setFailedImageUrls] = useState([]);
  const scoreText = formatProductBenefitScoreText(item.productBenefitScore);
  const benefitScoreText = [scoreText, item.benefitLabel]
    .filter(Boolean)
    .join(" ");
  const productImageUrl = getNextProductRankingImageUrl(
    item,
    failedImageUrls,
  );

  return (
    <PrimaryCard
      accessibilityLabel={`${item.productName}, ${benefitScoreText}`}
      accessibilityHint="Open canonical product details."
      onPress={() => {
        if (!requireSubscriptionAccess("supplement_info")) return;

        router.push({
          pathname: "/(modals)/modal/supplement-info",
          params: {
            id: createSupplementProductCatalogId(item.productId),
            name: item.productName,
          },
        });
      }}
      style={styles.rankCard}
      pressedStyle={styles.rankCardPressed}
    >
      <View style={styles.productHeadingRow}>
        <View
          accessible={!productImageUrl}
          accessibilityLabel={
            productImageUrl ? undefined : "Product image unavailable"
          }
          style={[
            styles.productImageFrame,
            !productImageUrl && styles.productImagePlaceholder,
          ]}
        >
          {productImageUrl ? (
            <Image
              accessible
              accessibilityLabel={`${item.productName} product image`}
              source={{ uri: productImageUrl }}
              style={styles.productImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={`${item.productId}:${productImageUrl}`}
              onError={() =>
                setFailedImageUrls((current) =>
                  current.includes(productImageUrl)
                    ? current
                    : [...current, productImageUrl],
                )
              }
            />
          ) : (
            <MaterialCommunityIcons
              name="pill"
              size={25}
              color={appTheme.colors.textMuted}
              style={styles.productImagePlaceholderIcon}
            />
          )}
        </View>

        <View style={styles.productCopy}>
          <Text style={styles.rankName}>{item.productName}</Text>
          {item.productBrand ? (
            <Text style={styles.productBrand}>{item.productBrand}</Text>
          ) : null}
          <View style={styles.productBenefitRow}>
            <Text style={styles.productBenefitScore}>{scoreText}</Text>
            {item.benefitLabel ? (
              <Text style={styles.productBenefitLabel}>
                {item.benefitLabel}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </PrimaryCard>
  );
});

export default function BenefitRankingScreen() {
  const {
    hasActiveAccess,
    isResolved,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
  } = useSubscriptionAccess();
  const params = useLocalSearchParams();
  const benefitLabel = normalizeParam(params.label).trim();
  const rankingEntity = resolveBenefitRankingEntityType(
    normalizeParam(params.entity),
  );
  const isProductRanking =
    rankingEntity === BENEFIT_RANKING_ENTITY_TYPES.PRODUCT;
  const initialProductRankingCache = getCachedProductRanking(benefitLabel);
  const [rankedSupplements, setRankedSupplements] = useState([]);
  const [rankedProducts, setRankedProducts] = useState(
    () => initialProductRankingCache?.items ?? [],
  );
  const rankedProductsRef = useRef(initialProductRankingCache?.items ?? []);
  const [productCursor, setProductCursor] = useState(
    () => initialProductRankingCache?.cursor ?? null,
  );
  const [productHasMore, setProductHasMore] = useState(
    () => initialProductRankingCache?.hasMore ?? false,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState("");
  const [loading, setLoading] = useState(
    () => !(isProductRanking && initialProductRankingCache),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [productBackendIssue, setProductBackendIssue] = useState(null);
  const rankedProductIdsKey = useMemo(
    () => rankedProducts.map((item) => item.productId).join("|"),
    [rankedProducts],
  );
  const safeBackAction = resolveBackNavigationAction({
    canGoBack: typeof router.canGoBack === "function" && router.canGoBack(),
    fallbackHref: "/rankings",
  });

  useEffect(() => {
    rankedProductsRef.current = rankedProducts;
  }, [rankedProducts]);

  useFocusEffect(
    useCallback(() => {
      if (!hasActiveAccess || !isProductRanking || !rankedProductIdsKey) {
        return undefined;
      }

      const initialMissingProductIds = getMissingProductImageIds(
        rankedProductsRef.current,
      );
      if (!initialMissingProductIds.length) return undefined;

      let active = true;
      let pollIndex = 0;
      let pollTimeout;
      let pollProductIds = [];

      const pollPersistedImages = async () => {
        if (!active || !pollProductIds.length) return;

        try {
          const { data: imageRows, error } = await getPersistedProductImages(
            pollProductIds,
          );
          if (!active) return;
          if (error) {
            console.error("Failed to refresh ranked product images", error);
          } else {
            setRankedProducts((current) => {
              const next = reconcileProductRankingImages(current, imageRows);
              rankedProductsRef.current = next;
              updateCachedProductRankingItems(benefitLabel, next);
              return next;
            });
            pollProductIds = recordPersistedProductImageStates(imageRows);
          }
        } catch (error) {
          if (active) {
            console.error("Failed to refresh ranked product images", error);
          }
        }

        if (
          active &&
          pollIndex < PRODUCT_IMAGE_POLL_DELAYS_MS.length &&
          pollProductIds.length > 0
        ) {
          const delay = PRODUCT_IMAGE_POLL_DELAYS_MS[pollIndex];
          pollIndex += 1;
          pollTimeout = setTimeout(pollPersistedImages, delay);
        }
      };

      enqueueMissingProductImages(initialMissingProductIds).then(
        async (result) => {
          if (!active) return;
          pollProductIds = Array.isArray(result?.pollProductIds)
            ? result.pollProductIds
            : [];
          const immediateReadProductIds = [
            ...new Set([
              ...pollProductIds,
              ...(Array.isArray(result?.resolvedProductIds)
                ? result.resolvedProductIds
                : []),
            ]),
          ];
          if (immediateReadProductIds.length) {
            const { data: imageRows, error } = await getPersistedProductImages(
              immediateReadProductIds,
            );
            if (!active) return;
            if (!error) {
              setRankedProducts((current) => {
                const next = reconcileProductRankingImages(current, imageRows);
                rankedProductsRef.current = next;
                updateCachedProductRankingItems(benefitLabel, next);
                return next;
              });
              pollProductIds = recordPersistedProductImageStates(imageRows);
            }
          }
          if (pollProductIds.length) {
            pollTimeout = setTimeout(
              pollPersistedImages,
              PRODUCT_IMAGE_POLL_DELAYS_MS[pollIndex],
            );
            pollIndex += 1;
          }
        },
      );

      return () => {
        active = false;
        clearTimeout(pollTimeout);
      };
    }, [benefitLabel, hasActiveAccess, isProductRanking, rankedProductIdsKey]),
  );

  useEffect(() => {
    if (hasActiveAccess || !isResolved) return;
    openSubscriptionPaywall({ replace: true });
  }, [hasActiveAccess, isResolved, openSubscriptionPaywall]);

  useEffect(() => {
    if (isProductRanking) return;

    if (!hasActiveAccess) {
      setRankedSupplements([]);
      setLoading(false);
      setErrorMessage("");
      return;
    }

    let active = true;

    const loadRankings = async () => {
      if (!benefitLabel) {
        if (!active) return;
        setRankedSupplements([]);
        setLoading(false);
        setErrorMessage("No benefit was selected.");
        return;
      }

      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplements")
        .select(
          "id, name, status, evidence_score, supplement_benefits!inner(id, supplement_name, label, icon, score, ranking_reason)",
        )
        .in("status", ["approved", "pending"])
        .eq("supplement_benefits.label", benefitLabel);

      if (!active) return;

      if (error) {
        console.error("Failed to load benefit rankings", error);
        setRankedSupplements([]);
        setErrorMessage("Could not load rankings for this benefit.");
        setLoading(false);
        return;
      }

      setRankedSupplements(buildRankedBenefitSupplements(data ?? []));
      setLoading(false);
    };

    loadRankings();

    return () => {
      active = false;
    };
  }, [benefitLabel, hasActiveAccess, isProductRanking]);

  useEffect(() => {
    if (!isProductRanking) return;

    if (!hasActiveAccess) {
      setRankedProducts([]);
      setProductCursor(null);
      setProductHasMore(false);
      setLoading(false);
      setErrorMessage("");
      return;
    }

    let active = true;

    const loadProductRankings = async () => {
      const cached = getCachedProductRanking(benefitLabel);
      const cachedItems = cached?.items ?? [];
      rankedProductsRef.current = cachedItems;
      setRankedProducts(cachedItems);
      setProductCursor(cached?.cursor ?? null);
      setProductHasMore(cached?.hasMore ?? false);
      setPaginationError("");
      setProductBackendIssue(null);

      if (!benefitLabel) {
        setLoading(false);
        setErrorMessage("No benefit was selected.");
        return;
      }

      setLoading(!cached);
      setErrorMessage("");
      const result = await getProductBenefitRankingPage({ benefitLabel });
      if (!active) return;

      if (result.status === "unavailable") {
        if (!cached) {
          const failure = getProductRankingFailureCopy(result.reason);
          setProductBackendIssue(failure);
          setErrorMessage(failure.description);
        }
      } else if (result.status !== "ready") {
        if (!cached) {
          const failure = getProductRankingFailureCopy(result.reason);
          setProductBackendIssue(failure);
          setErrorMessage(failure.description);
        }
      } else {
        const currentItems = rankedProductsRef.current;
        const nextItems = mergeRefreshedProductRankingPage(
          currentItems,
          result.items,
        );
        const preservedCachedTail = nextItems.length > result.items.length;
        const nextCursor = preservedCachedTail
          ? cached?.cursor ?? result.nextCursor
          : result.nextCursor;
        const nextHasMore = preservedCachedTail
          ? cached?.hasMore ?? result.hasMore
          : result.hasMore;
        rankedProductsRef.current = nextItems;
        setRankedProducts(nextItems);
        setProductCursor(nextCursor);
        setProductHasMore(nextHasMore);
        setCachedProductRanking(benefitLabel, {
          items: nextItems,
          cursor: nextCursor,
          hasMore: nextHasMore,
        });
      }
      setLoading(false);
    };

    loadProductRankings();

    return () => {
      active = false;
    };
  }, [benefitLabel, hasActiveAccess, isProductRanking]);

  const loadMoreProducts = async () => {
    if (!isProductRanking || !productHasMore || !productCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setPaginationError("");
    const result = await getProductBenefitRankingPage({
      benefitLabel,
      cursor: productCursor,
    });
    if (result.status === "ready") {
      setRankedProducts((current) => {
        const nextItems = appendProductRankingPage(current, result.items);
        rankedProductsRef.current = nextItems;
        setCachedProductRanking(benefitLabel, {
          items: nextItems,
          cursor: result.nextCursor,
          hasMore: result.hasMore,
        });
        return nextItems;
      });
      setProductCursor(result.nextCursor);
      setProductHasMore(result.hasMore);
    } else {
      setPaginationError(
        "Could not load more products. Your current rankings are still available.",
      );
    }
    setLoadingMore(false);
  };

  if (!hasActiveAccess) {
    return <BackdropScreen scrollable={false} />;
  }

  const rankedItems = isProductRanking ? rankedProducts : rankedSupplements;

  return (
    <BackdropScreen
      bottomInsetOffset={72}
      minBottomPadding={96}
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => {
                if (safeBackAction.type === "back") {
                  router.back();
                  return;
                }

                router.replace(safeBackAction.href);
              }}
              variant="overlay"
              size="icon"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title={benefitLabel || "Benefit"}
          titleStyle={styles.headerTitle}
          titleAccessory={
            isProductRanking ? null : (
              <StatusPill
                label={`${rankedItems.length} supplements`}
                tone="neutral"
                style={styles.headerCount}
              />
            )
          }
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              {isProductRanking
                ? "All scanned products currently ranked for this benefit"
                : "All supplements currently ranked for this benefit"}
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
    >
      {loading ? (
        <PrimaryCard style={styles.stateCard}>
          <Text style={styles.stateText}>
            {isProductRanking
              ? "Loading ranked products..."
              : "Loading ranked supplements..."}
          </Text>
        </PrimaryCard>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyStateCard
          title={productBackendIssue?.title ?? "Ranking unavailable"}
          description={errorMessage}
        />
      ) : null}

      {!loading && !errorMessage && rankedItems.length === 0 ? (
        <EmptyStateCard
          title={
            isProductRanking ? "No rated products yet" : "No ranked supplements"
          }
          description={
            isProductRanking
              ? "No eligible verified products have a valid dose-adjusted score for this benefit yet. Unrated products are not placed at zero."
              : "No catalog supplements are currently ranked for this benefit."
          }
        />
      ) : null}

      {!loading && !errorMessage && !isProductRanking
        ? rankedSupplements.map((item) => {
            const itemIcon = getBenefitIconComponent(item.benefit?.label);
            const itemColor = getBenefitColor(item.benefit?.icon);

            return (
              <PrimaryCard
                key={item.id}
                onPress={() => {
                  if (!requireSubscriptionAccess("supplement_info")) return;

                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: item.id, name: item.name },
                  });
                }}
                style={styles.rankCard}
                pressedStyle={styles.rankCardPressed}
              >
                <View style={styles.rankRow}>
                  <View style={styles.rankLeft}>
                    <View style={styles.rankNumberWrap}>
                      <Text style={styles.rankNumber}>
                        {item.rank ? `#${item.rank}` : "—"}
                      </Text>
                    </View>

                    <BenefitIconBadge
                      label={item.benefit?.label}
                      color={itemColor}
                      tone={item.benefit?.icon}
                      Icon={itemIcon}
                      size={22}
                      containerSize={44}
                    />

                    <View style={styles.rankCopy}>
                      <Text style={styles.rankName}>{item.name}</Text>
                      <Text style={styles.rankMeta}>
                        {item.rank
                          ? `Rank ${item.rank} of ${item.total}`
                          : "No benefit score available"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.scoreRow}>
                  <Text style={styles.scoreText}>
                    {item.benefit?.ranking_reason?.trim() ||
                      "No ranking reason available."}
                  </Text>
                </View>
              </PrimaryCard>
            );
          })
        : null}

      {!loading && !errorMessage && isProductRanking
        ? rankedProducts.map((item) => (
            <ProductRankingCard
              key={item.productId}
              item={item}
              requireSubscriptionAccess={requireSubscriptionAccess}
            />
          ))
        : null}

      {!loading && !errorMessage && isProductRanking && productHasMore ? (
        <View style={styles.paginationFooter}>
          {paginationError ? (
            <Text accessibilityRole="alert" style={styles.paginationError}>
              {paginationError}
            </Text>
          ) : null}
          <AppButton
            onPress={loadMoreProducts}
            disabled={loadingMore}
            label={loadingMore ? "Loading..." : "Load more products"}
            accessibilityLabel={
              loadingMore
                ? "Loading more products"
                : "Load more ranked products"
            }
            style={styles.loadMoreButton}
          />
        </View>
      ) : null}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    marginRight: spacing.md,
  },
  headerCount: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  stateCard: {
    marginBottom: spacing.md,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  rankCard: {
    marginBottom: spacing.md,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  rankCardPressed: {
    opacity: 0.94,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rankLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  rankNumberWrap: {
    width: 42,
    marginRight: spacing.sm,
  },
  rankNumber: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingBlack,
    color: appTheme.colors.textPrimary,
  },
  rankCopy: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  rankName: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  rankMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  productHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  productImageFrame: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  productImage: {
    width: 52,
    height: 52,
  },
  productImagePlaceholder: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 0,
  },
  productImagePlaceholderIcon: {
    opacity: 0.48,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
  },
  productBrand: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  productBenefitRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
  },
  productBenefitScore: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  productBenefitLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scoreRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSubtle,
  },
  scoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  paginationFooter: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  paginationError: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  loadMoreButton: {
    alignSelf: "stretch",
  },
});
