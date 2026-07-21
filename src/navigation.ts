import type { Category } from './domain/types';

export type RootStackParamList = {
  Tabs: undefined;
  Setup: undefined;
  Plan: undefined;
  Wishlist: undefined;
  PostDetail: { postId: string };
  TripDetail: { tripId: string };
  CostSplit: { tripId: string };
  Passport: undefined;
  AiPlan: undefined;
  Publish: { title: string; city: string; themes: Category[]; stopIds: string[] };
  UserProfile: { userId: string };
  ShareChooser: undefined;
  Settings: undefined;
};

export type TabParamList = {
  Discover: undefined;
  Explore: undefined;
  Trips: undefined;
  Profile: undefined;
};
