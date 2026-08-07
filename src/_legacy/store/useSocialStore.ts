import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Comment, FeedPost } from '../domain/social';

/**
 * User-generated social content, persisted locally (there's no backend in the
 * MVP). The seed feed/comments stay in socialService; this store overlays what
 * *you* add — published plans, comments, likes, saves, follows — and screens
 * merge the two. When a real backend lands, these actions become API writes.
 */
interface SocialState {
  myPosts: FeedPost[];
  commentsByPost: Record<string, Comment[]>;
  likedCommentIds: string[];
  likedPostIds: string[];
  savedPostIds: string[];
  followedUserIds: string[];
  publishPost: (post: FeedPost) => void;
  addComment: (postId: string, comment: Comment) => void;
  toggleCommentLike: (commentId: string) => void;
  togglePostLike: (postId: string) => void;
  togglePostSave: (postId: string) => void;
  toggleFollow: (userId: string) => void;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export const useSocialStore = create<SocialState>()(
  persist(
    (set) => ({
      myPosts: [],
      commentsByPost: {},
      likedCommentIds: [],
      likedPostIds: [],
      savedPostIds: [],
      followedUserIds: [],
      publishPost: (post) => set((s) => ({ myPosts: [post, ...s.myPosts] })),
      addComment: (postId, comment) =>
        set((s) => ({
          commentsByPost: {
            ...s.commentsByPost,
            [postId]: [...(s.commentsByPost[postId] ?? []), comment],
          },
        })),
      toggleCommentLike: (commentId) =>
        set((s) => ({ likedCommentIds: toggle(s.likedCommentIds, commentId) })),
      togglePostLike: (postId) =>
        set((s) => ({ likedPostIds: toggle(s.likedPostIds, postId) })),
      togglePostSave: (postId) =>
        set((s) => ({ savedPostIds: toggle(s.savedPostIds, postId) })),
      toggleFollow: (userId) =>
        set((s) => ({ followedUserIds: toggle(s.followedUserIds, userId) })),
    }),
    {
      name: 'tripcircle-social',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
