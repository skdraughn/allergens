import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchRestaurantCommunity,
  DuplicateRestaurantRequestError,
  submitCommunityAllergyReview,
  submitMenuItemReport,
  submitRestaurantRequest,
} from "@/features/community/community-service";
import { bucketCount, safeErrorCode } from "@/lib/telemetry/schema";
import { telemetry } from "@/lib/telemetry/telemetry";

export const communityQueryKey = (restaurantId: string) => ["community", restaurantId] as const;

export function useRestaurantCommunity(restaurantId: string) {
  return useQuery({
    enabled: Boolean(restaurantId),
    gcTime: 1000 * 60 * 60,
    queryFn: async () => {
      const trace = telemetry.startTrace("community_load");
      try {
        const community = await fetchRestaurantCommunity(restaurantId);
        trace.stop({
          attributes: { review_count_bucket: bucketCount(community.reviews.length) },
          outcome: "success",
        });
        return community;
      } catch (error) {
        trace.stop({ outcome: "failure" });
        telemetry.recordError(error, "community_load", {
          errorCode: safeErrorCode(error),
        });
        throw error;
      }
    },
    queryKey: communityQueryKey(restaurantId),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCommunitySubmission(restaurantId?: string | null) {
  const queryClient = useQueryClient();
  const invalidateRestaurant = () => {
    if (restaurantId) {
      void queryClient.invalidateQueries({ queryKey: communityQueryKey(restaurantId) });
    }
  };

  return {
    submitReview: useMutation({
      mutationFn: async (input: Parameters<typeof submitCommunityAllergyReview>[0]) => {
        const trace = telemetry.startTrace("community_submission", {
          submission_type: "review",
        });
        const scope = input.menuItemId ? "menu_item" : "restaurant";
        try {
          const result = await submitCommunityAllergyReview(input);
          trace.stop({ outcome: "success" });
          telemetry.track("review_submitted", {
            menu_item_id: input.menuItemId,
            outcome: "queued",
            restaurant_id: input.restaurantId,
            scope,
          });
          return result;
        } catch (error) {
          trace.stop({ outcome: "failure" });
          telemetry.track("review_failed", {
            error_code: safeErrorCode(error),
            menu_item_id: input.menuItemId,
            restaurant_id: input.restaurantId,
            scope,
          });
          telemetry.recordError(error, "community_submission", {
            errorCode: safeErrorCode(error),
          });
          throw error;
        }
      },
      onSuccess: invalidateRestaurant,
    }),
    submitReport: useMutation({
      mutationFn: async (input: Parameters<typeof submitMenuItemReport>[0]) => {
        const trace = telemetry.startTrace("community_submission", {
          submission_type: "report",
        });
        try {
          const result = await submitMenuItemReport(input);
          trace.stop({ outcome: "success" });
          telemetry.track("report_submitted", {
            menu_item_id: input.menuItemId,
            outcome: "queued",
            restaurant_id: input.restaurantId,
            scope: input.menuItemId ? "menu_item" : "restaurant",
          });
          return result;
        } catch (error) {
          trace.stop({ outcome: "failure" });
          telemetry.recordError(error, "community_submission", {
            errorCode: safeErrorCode(error),
          });
          throw error;
        }
      },
      onSuccess: invalidateRestaurant,
    }),
    submitRestaurantRequest: useMutation({
      mutationFn: async (input: Parameters<typeof submitRestaurantRequest>[0]) => {
        const trace = telemetry.startTrace("community_submission", {
          submission_type: "restaurant_request",
        });
        try {
          const result = await submitRestaurantRequest(input);
          trace.stop({ outcome: "success" });
          telemetry.track("restaurant_request_submitted", { outcome: "queued" });
          return result;
        } catch (error) {
          trace.stop({ outcome: "failure" });
          if (error instanceof DuplicateRestaurantRequestError) {
            telemetry.track("restaurant_request_duplicate");
          } else {
            telemetry.track("restaurant_request_failed", {
              error_code: safeErrorCode(error),
            });
            telemetry.recordError(error, "community_submission", {
              errorCode: safeErrorCode(error),
            });
          }
          throw error;
        }
      },
    }),
  };
}
