import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchRestaurantCommunity,
  submitCommunityComment,
  submitCommunityMenuItem,
  submitMenuItemReport,
  submitRestaurantRequest,
} from "@/features/community/community-service";

export const communityQueryKey = (restaurantId: string) => ["community", restaurantId] as const;

export function useRestaurantCommunity(restaurantId: string) {
  return useQuery({
    enabled: Boolean(restaurantId),
    gcTime: 1000 * 60 * 60,
    queryFn: () => fetchRestaurantCommunity(restaurantId),
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
    submitComment: useMutation({
      mutationFn: submitCommunityComment,
      onSuccess: invalidateRestaurant,
    }),
    submitMenuItem: useMutation({
      mutationFn: submitCommunityMenuItem,
      onSuccess: invalidateRestaurant,
    }),
    submitReport: useMutation({
      mutationFn: submitMenuItemReport,
      onSuccess: invalidateRestaurant,
    }),
    submitRestaurantRequest: useMutation({
      mutationFn: submitRestaurantRequest,
    }),
  };
}
