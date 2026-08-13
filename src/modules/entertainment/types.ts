export type EntertainmentMode = 'books' | 'radio' | 'music';

export interface YouTubeNormalizedResult {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  liveBroadcastContent?: string;
}

export interface EntertainmentSearchResponse {
  success: boolean;
  mode?: EntertainmentMode;
  query?: string;
  searchQueryUsed?: string;
  cached?: boolean;
  results: YouTubeNormalizedResult[];
  error?: string;
  message?: string;
}
