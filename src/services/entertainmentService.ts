import { EntertainmentMode, EntertainmentSearchResponse } from '../modules/entertainment/types';
import { ApiAuthError, buildAuthHeaders, throwIfAuthRejected } from '../lib/authHeaders';

/**
 * Calls Express / Netlify Backend endpoint GET /api/entertainment/search with JWT auth.
 * Direct client-side YOUTUBE_API_KEY calls are disabled to protect API keys.
 */
export async function searchEntertainment(
  query: string,
  mode: EntertainmentMode
): Promise<EntertainmentSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'EMPTY_QUERY',
      message: 'Nội dung tìm kiếm không được để trống.',
      results: [],
    };
  }

  try {
    const url = `/api/entertainment/search?q=${encodeURIComponent(trimmed)}&mode=${encodeURIComponent(mode)}`;
    const headers = await buildAuthHeaders({ Accept: 'application/json' });
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    await throwIfAuthRejected(response);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data: EntertainmentSearchResponse = await response.json();
      return data;
    }

    return {
      success: false,
      error: 'BACKEND_UNAVAILABLE',
      message: `Máy chủ tìm kiếm giải trí chưa sẵn sàng (HTTP ${response.status}).`,
      results: [],
    };
  } catch (error: any) {
    if (error instanceof ApiAuthError) {
      return {
        success: false,
        error: error.code || 'UNAUTHORIZED',
        message: error.message,
        results: [],
      };
    }
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error?.message || 'Không thể kết nối máy chủ tìm kiếm giải trí.',
      results: [],
    };
  }
}
