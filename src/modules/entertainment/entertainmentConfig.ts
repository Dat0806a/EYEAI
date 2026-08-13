import { EntertainmentMode } from './types';

export interface SuggestionItem {
  id: string;
  title: string;
  author: string;
  duration: string;
  query: string;
}

export interface ModeConfig {
  id: EntertainmentMode;
  label: string;
  iconName: string;
  placeholder: string;
  searchSuffix: string;
  defaultSuggestions: SuggestionItem[];
}

export const ENTERTAINMENT_MODE_CONFIG: Record<EntertainmentMode, ModeConfig> = {
  books: {
    id: 'books',
    label: 'Đọc sách',
    iconName: 'BookOpen',
    placeholder: 'Tìm tên sách, tác giả hoặc sách nói...',
    searchSuffix: 'sách nói',
    defaultSuggestions: [
      { id: 'b1', title: 'Dế Mèn phiêu lưu ký', author: 'Sách nói tác phẩm Tô Hoài', duration: 'Audiobook', query: 'Dế Mèn phiêu lưu ký' },
      { id: 'b2', title: 'Truyện Kiều', author: 'Sách nói tác phẩm Nguyễn Du', duration: 'Audiobook', query: 'Truyện Kiều' },
      { id: 'b3', title: 'Hạt Giống Tâm Hồn', author: 'Sách nói truyền cảm hứng', duration: 'Audiobook', query: 'Hạt Giống Tâm Hồn' },
    ],
  },
  radio: {
    id: 'radio',
    label: 'Radio',
    iconName: 'Radio',
    placeholder: 'Tìm kênh radio, VOV hoặc phát thanh...',
    searchSuffix: 'radio',
    defaultSuggestions: [
      { id: 'r1', title: 'VOV1', author: 'Đài Tiếng Nói Việt Nam - Thời sự', duration: 'Trực tiếp', query: 'VOV1' },
      { id: 'r2', title: 'VOV2', author: 'Kênh Văn hóa - Xã hội', duration: 'Trực tiếp', query: 'VOV2' },
      { id: 'r3', title: 'Đọc truyện đêm khuya', author: 'Phát thanh văn nghệ', duration: 'Radio recording', query: 'Đọc truyện đêm khuya VOV' },
    ],
  },
  music: {
    id: 'music',
    label: 'Nghe nhạc',
    iconName: 'Music',
    placeholder: 'Tìm bài hát, ca sĩ hoặc thể loại nhạc...',
    searchSuffix: 'nhạc',
    defaultSuggestions: [
      { id: 'm1', title: 'Sơn Tùng M-TP', author: 'Tuyển tập nhạc hay nhất', duration: 'Music Video', query: 'Sơn Tùng' },
      { id: 'm2', title: 'Nhạc Trịnh Trị Liệu', author: 'Nhạc không lời thư giãn', duration: 'Playlist', query: 'Nhạc Trịnh không lời' },
      { id: 'm3', title: 'Nhạc Thư Giãn Dễ Ngủ', author: 'Âm thanh tự nhiên nhẹ nhàng', duration: 'Relaxing Music', query: 'Nhạc thư giãn dễ ngủ' },
    ],
  },
};
