import { localPostsRepository } from "@/lib/localPostsRepository";
import type { Post, PostRecordInput } from "@/types/post";

export interface PostsRepository {
  list(): Promise<Post[]>;
  getById(id: string): Promise<Post | null>;
  create(input: PostRecordInput): Promise<Post>;
  update(id: string, input: Partial<PostRecordInput>, options?: { touchUpdatedAt?: boolean }): Promise<Post>;
  updateOgp(id: string, ogp: Post["ogp"]): Promise<Post>;
  importMany(posts: Post[]): Promise<Post[]>;
  delete(id: string): Promise<void>;
}

export const postsRepository: PostsRepository = localPostsRepository;
