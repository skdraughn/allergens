export type RestaurantSource = {
  id: string;
  name: string;
  rank: number;
  [key: string]: unknown;
};

export const rankingSource: string;
export const restaurantSources: RestaurantSource[];
