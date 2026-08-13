import { GridItem } from '../types';

export const KEYBOARD_LAYOUT: GridItem[][] = [
  // Hàng 0: Cụm từ gợi ý phần A (4 cụm từ dài)
  [
    { id: 'p1', type: 'phrase', label: '🆘 Hỗ trợ tôi', value: 'Hỗ trợ tôi.' },
    { id: 'p2', type: 'phrase', label: '😋 Tôi đói bụng', value: 'Tôi cảm thấy đói.' },
    { id: 'p3', type: 'phrase', label: '💧 Tôi khát nước', value: 'Tôi muốn uống nước.' },
    { id: 'p4', type: 'phrase', label: '🚾 Đi vệ sinh', value: 'Tôi cần đi vệ sinh.' }
  ],
  // Hàng 1: Cụm từ gợi ý phần B (4 cụm từ dài)
  [
    { id: 'p5', type: 'phrase', label: '🤕 Tôi thấy đau', value: 'Tôi thấy đau.' },
    { id: 'p6', type: 'phrase', label: '📞 Gọi người thân', value: 'Tôi muốn gọi người thân.' },
    { id: 'p7', type: 'phrase', label: '🩺 Cần bác sĩ', value: 'Tôi cần bác sĩ.' },
    { id: 'p8', type: 'phrase', label: '🛌 Muốn nghỉ ngơi', value: 'Tôi muốn nghỉ ngơi.' }
  ],
  // Hàng 2: Chữ cái tiếng Việt 1
  [
    { id: 'l_a', type: 'letter', label: 'A', value: 'a' },
    { id: 'l_aw', type: 'letter', label: 'Ă', value: 'ă' },
    { id: 'l_aa', type: 'letter', label: 'Â', value: 'â' },
    { id: 'l_b', type: 'letter', label: 'B', value: 'b' },
    { id: 'l_c', type: 'letter', label: 'C', value: 'c' },
    { id: 'l_d', type: 'letter', label: 'D', value: 'd' },
    { id: 'l_dd', type: 'letter', label: 'Đ', value: 'đ' }
  ],
  // Hàng 3: Chữ cái tiếng Việt 2
  [
    { id: 'l_e', type: 'letter', label: 'E', value: 'e' },
    { id: 'l_ee', type: 'letter', label: 'Ê', value: 'ê' },
    { id: 'l_g', type: 'letter', label: 'G', value: 'g' },
    { id: 'l_h', type: 'letter', label: 'H', value: 'h' },
    { id: 'l_i', type: 'letter', label: 'I', value: 'i' },
    { id: 'l_k', type: 'letter', label: 'K', value: 'k' },
    { id: 'l_l', type: 'letter', label: 'L', value: 'l' }
  ],
  // Hàng 4: Chữ cái tiếng Việt 3
  [
    { id: 'l_m', type: 'letter', label: 'M', value: 'm' },
    { id: 'l_n', type: 'letter', label: 'N', value: 'n' },
    { id: 'l_o', type: 'letter', label: 'O', value: 'o' },
    { id: 'l_oo', type: 'letter', label: 'Ô', value: 'ô' },
    { id: 'l_ow', type: 'letter', label: 'Ơ', value: 'ơ' },
    { id: 'l_p', type: 'letter', label: 'P', value: 'p' },
    { id: 'l_q', type: 'letter', label: 'Q', value: 'q' }
  ],
  // Hàng 5: Chữ cái tiếng Việt 4
  [
    { id: 'l_r', type: 'letter', label: 'R', value: 'r' },
    { id: 'l_s', type: 'letter', label: 'S', value: 's' },
    { id: 'l_t', type: 'letter', label: 'T', value: 't' },
    { id: 'l_u', type: 'letter', label: 'U', value: 'u' },
    { id: 'l_uw', type: 'letter', label: 'Ư', value: 'ư' },
    { id: 'l_v', type: 'letter', label: 'V', value: 'v' },
    { id: 'l_x', type: 'letter', label: 'X', value: 'x' }
  ],
  // Hàng 6: Nguyên âm ghép hoặc dấu và chữ còn lại
  [
    { id: 'l_y', type: 'letter', label: 'Y', value: 'y' },
    { id: 'd_sac', type: 'letter', label: 'Sắc (´)', value: 's' },     // Sẽ dùng để bỏ dấu thông minh hoặc gõ tiếp
    { id: 'd_huyen', type: 'letter', label: 'Huyền (`)', value: 'f' },
    { id: 'd_hoi', type: 'letter', label: 'Hỏi (ˀ)', value: 'r' },
    { id: 'd_nga', type: 'letter', label: 'Ngã (~)', value: 'x' },
    { id: 'd_nang', type: 'letter', label: 'Nặng (.)', value: 'j' },
    { id: 'l_space', type: 'action', label: '⌨️ Dấu Cách', value: ' ', colorClass: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-100 dark:border-emerald-800' }
  ],
  // Hàng 7: Các nút chức năng xóa, cách, gửi
  [
    { id: 'act_back', type: 'action', label: '⬅️ Xóa chữ (Backspace)', value: 'BACKSPACE', colorClass: 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-950 dark:hover:bg-amber-900 dark:text-amber-100 dark:border-amber-800' },
    { id: 'act_clear', type: 'action', label: '🗑️ Xóa tất cả', value: 'CLEAR_ALL', colorClass: 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300 dark:bg-rose-950 dark:hover:bg-rose-900 dark:text-rose-100 dark:border-rose-800' },
    { id: 'act_send', type: 'action', label: '🚀 GỬI TIN NHẮN (Send)', value: 'SEND', colorClass: 'bg-sky-600 hover:bg-sky-700 text-white border-sky-700 dark:bg-sky-700 dark:hover:bg-sky-600' }
  ]
];

// Helper to determine Vietnamese accented writing (Telex-like combination)
// However, to keep it simple for the user, if they type letter followed by tone marker,
// we can combine them, or let them just type standard character sequences. Let's write an automatic Telex sound / accent combiner
// so that if they type "a" then "s", it converts to "á" in the chat input! That is incredibly high-quality!
// Let's create a helper to dynamically combine a base letter and standard Telex markers:
// s -> sắc, f -> huyền, r -> hỏi, x -> ngã, j -> nặng.
export function applyVietnameseAccents(text: string): string {
  if (!text) return '';

  // Simple Telex combination lookup helper
  // Pairs of (char, telex) -> accented char
  const combinations: { [key: string]: string } = {
    'as': 'á', 'af': 'à', 'ar': 'ả', 'ax': 'ã', 'aj': 'ạ',
    'âs': 'ấ', 'âf': 'ầ', 'âr': 'ẩ', 'âx': 'ẫ', 'âj': 'ậ',
    'ăs': 'ắ', 'ăf': 'ằ', 'ăr': 'ẳ', 'ăx': 'ẵ', 'ăj': 'ặ',
    'es': 'é', 'ef': 'è', 'er': 'ẻ', 'ex': 'ẽ', 'ej': 'ẹ',
    'ês': 'ế', 'êf': 'ề', 'êr': 'ể', 'êx': 'ễ', 'êj': 'ệ',
    'is': 'í', 'if': 'ì', 'ir': 'ỉ', 'ix': 'ĩ', 'ij': 'ị',
    'os': 'ó', 'of': 'ò', 'or': 'ỏ', 'ox': 'õ', 'oj': 'ọ',
    'ôs': 'ố', 'ôf': 'ồ', 'ôr': 'ổ', 'ôx': 'ỗ', 'ôj': 'ộ',
    'ơs': 'ớ', 'ơf': 'ờ', 'ơr': 'ở', 'ơx': 'ỡ', 'ơj': 'ợ',
    'us': 'ú', 'uf': 'ù', 'ur': 'ủ', 'ux': 'ũ', 'uj': 'ụ',
    'ưs': 'ứ', 'ưf': 'ừ', 'ưr': 'ử', 'ưx': 'ữ', 'ưj': 'ự',
    'ys': 'ý', 'yf': 'ỳ', 'yr': 'ỷ', 'yx': 'ỹ', 'yj': 'ỵ',
    'as ': 'á ', 'af ': 'à ', 'ar ': 'ả ', 'ax ': 'ã ', 'aj ': 'ạ ',
    // Capital variants for startup safety
    'As': 'Á', 'Af': 'À', 'Ar': 'Ả', 'Ax': 'Ã', 'Aj': 'Ạ',
  };

  // We look at the last character and the one before it
  if (text.length >= 2) {
    const lastTwo = text.slice(-2);
    if (combinations[lastTwo]) {
      return text.slice(0, -2) + combinations[lastTwo];
    }
  }

  return text;
}
