export class NearbyCommunityMealClusterDto {
  id: string;
  demandCount: number;
  cuisine: string;
  mealType: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  approximateLocation: {
    lat: number;
    lng: number;
  };
  distance: number;
}
