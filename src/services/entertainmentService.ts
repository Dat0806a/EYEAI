import { EntertainmentMode, EntertainmentSearchResponse } from '../modules/entertainment/types';

/**
 * Calls Express Backend endpoint GET /api/entertainment/search
 * Direct user -> Express -> YouTube Data API v3 flow. Zero Gemini interaction.
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
    const url = `/api/entertainment/search?q=${encodeURIComponent(trimmed)}&mode=${mode}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data: EntertainmentSearchResponse = await response.json();
    return data;
  } catch (error: any) {
    console.error('[EntertainmentService] Fetch error:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến máy chủ Express backend. Vui lòng kiểm tra lại mạng.',
      results: [],
    };
  }
}
