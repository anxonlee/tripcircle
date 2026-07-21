import type { Comment, FeedPost, User } from '../domain/social';
import { commentsByPost, feedPosts, myPlans } from './mock/feed';
import { currentUser, users } from './mock/users';

/**
 * Feed / people provider boundary (Phase 3). The UI never imports mock feed
 * data directly — same swap discipline as PlacesService/RoutingService so a
 * real backend can drop in behind this interface.
 */
export interface SocialService {
  currentUser(): User;
  listFeed(): Promise<FeedPost[]>;
  /** The current user's own published plans (profile Plans grid). */
  listMyPlans(): Promise<FeedPost[]>;
  getPost(id: string): Promise<FeedPost | undefined>;
  listComments(postId: string): Promise<Comment[]>;
  getUser(id: string): User | undefined;
}

class MockSocialService implements SocialService {
  currentUser(): User {
    return currentUser;
  }
  async listFeed(): Promise<FeedPost[]> {
    return feedPosts;
  }
  async listMyPlans(): Promise<FeedPost[]> {
    return myPlans;
  }
  async getPost(id: string): Promise<FeedPost | undefined> {
    return feedPosts.find((p) => p.id === id) ?? myPlans.find((p) => p.id === id);
  }
  async listComments(postId: string): Promise<Comment[]> {
    return commentsByPost[postId] ?? [];
  }
  getUser(id: string): User | undefined {
    return users[id];
  }
}

export const socialService: SocialService = new MockSocialService();
