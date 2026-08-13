import { GridItem } from './types';

// Standard 4-row Smartphone QWERTY Layout
export const QWERTY_LAYOUT: GridItem[][] = [
  // Row 0: Top letter row (10 keys)
  [
    { id: 'q', type: 'letter', label: 'Q', value: 'q' },
    { id: 'w', type: 'letter', label: 'W', value: 'w' },
    { id: 'e', type: 'letter', label: 'E', value: 'e' },
    { id: 'r', type: 'letter', label: 'R', value: 'r' },
    { id: 't', type: 'letter', label: 'T', value: 't' },
    { id: 'y', type: 'letter', label: 'Y', value: 'y' },
    { id: 'u', type: 'letter', label: 'U', value: 'u' },
    { id: 'i', type: 'letter', label: 'I', value: 'i' },
    { id: 'o', type: 'letter', label: 'O', value: 'o' },
    { id: 'p', type: 'letter', label: 'P', value: 'p' },
  ],
  // Row 1: Home letter row (9 keys)
  [
    { id: 'a', type: 'letter', label: 'A', value: 'a' },
    { id: 's', type: 'letter', label: 'S', value: 's' },
    { id: 'd', type: 'letter', label: 'D', value: 'd' },
    { id: 'f', type: 'letter', label: 'F', value: 'f' },
    { id: 'g', type: 'letter', label: 'G', value: 'g' },
    { id: 'h', type: 'letter', label: 'H', value: 'h' },
    { id: 'j', type: 'letter', label: 'J', value: 'j' },
    { id: 'k', type: 'letter', label: 'K', value: 'k' },
    { id: 'l', type: 'letter', label: 'L', value: 'l' },
  ],
  // Row 2: Bottom letter row + Backspace (9 keys)
  [
    { id: 'mode_phrase', type: 'action', label: 'Mẫu câu', value: 'TOGGLE_PHRASES', colorClass: 'bg-[#6AC9F0]/20 text-[#14213D] font-bold border-[#6AC9F0]/40' },
    { id: 'z', type: 'letter', label: 'Z', value: 'z' },
    { id: 'x', type: 'letter', label: 'X', value: 'x' },
    { id: 'c', type: 'letter', label: 'C', value: 'c' },
    { id: 'v', type: 'letter', label: 'V', value: 'v' },
    { id: 'b', type: 'letter', label: 'B', value: 'b' },
    { id: 'n', type: 'letter', label: 'N', value: 'n' },
    { id: 'm', type: 'letter', label: 'M', value: 'm' },
    { id: 'backspace', type: 'action', label: '⌫', value: 'BACKSPACE', colorClass: 'bg-amber-100 text-amber-900 font-black border-amber-300' },
  ],
  // Row 3: Spacebar & Actions bar (5 keys)
  [
    { id: 'mode_num', type: 'action', label: '123', value: 'TOGGLE_NUMBERS', colorClass: 'bg-slate-200 text-[#14213D] font-black border-slate-300' },
    { id: 'comma', type: 'letter', label: ',', value: ',' },
    { id: 'space', type: 'action', label: 'Cách', value: ' ', colorClass: 'bg-white text-[#14213D] font-bold border-[#14213D]/20 flex-2' },
    { id: 'period', type: 'letter', label: '.', value: '.' },
    { id: 'action_send', type: 'action', label: 'Gửi', value: 'SEND', colorClass: 'bg-[#FF6F61] text-white font-black border-[#FF6F61] flex-1.5' },
  ],
];

// Numbers & Symbols Layout
export const NUMBERS_LAYOUT: GridItem[][] = [
  [
    { id: 'n1', type: 'letter', label: '1', value: '1' },
    { id: 'n2', type: 'letter', label: '2', value: '2' },
    { id: 'n3', type: 'letter', label: '3', value: '3' },
    { id: 'n4', type: 'letter', label: '4', value: '4' },
    { id: 'n5', type: 'letter', label: '5', value: '5' },
    { id: 'n6', type: 'letter', label: '6', value: '6' },
    { id: 'n7', type: 'letter', label: '7', value: '7' },
    { id: 'n8', type: 'letter', label: '8', value: '8' },
    { id: 'n9', type: 'letter', label: '9', value: '9' },
    { id: 'n0', type: 'letter', label: '0', value: '0' },
  ],
  [
    { id: 's_excl', type: 'letter', label: '!', value: '!' },
    { id: 's_at', type: 'letter', label: '@', value: '@' },
    { id: 's_hash', type: 'letter', label: '#', value: '#' },
    { id: 's_dollar', type: 'letter', label: '$', value: '$' },
    { id: 's_percent', type: 'letter', label: '%', value: '%' },
    { id: 's_caret', type: 'letter', label: '^', value: '^' },
    { id: 's_amp', type: 'letter', label: '&', value: '&' },
    { id: 's_star', type: 'letter', label: '*', value: '*' },
    { id: 's_lparen', type: 'letter', label: '(', value: '(' },
    { id: 's_rparen', type: 'letter', label: ')', value: ')' },
  ],
  [
    { id: 'mode_abc', type: 'action', label: 'ABC', value: 'TOGGLE_ABC', colorClass: 'bg-[#6AC9F0] text-[#14213D] font-black border-[#6AC9F0]' },
    { id: 's_dash', type: 'letter', label: '-', value: '-' },
    { id: 's_plus', type: 'letter', label: '+', value: '+' },
    { id: 's_equal', type: 'letter', label: '=', value: '=' },
    { id: 's_slash', type: 'letter', label: '/', value: '/' },
    { id: 's_colon', type: 'letter', label: ':', value: ':' },
    { id: 's_semicolon', type: 'letter', label: ';', value: ';' },
    { id: 's_question', type: 'letter', label: '?', value: '?' },
    { id: 'backspace_num', type: 'action', label: '⌫', value: 'BACKSPACE', colorClass: 'bg-amber-100 text-amber-900 font-black border-amber-300' },
  ],
  [
    { id: 'mode_abc2', type: 'action', label: 'ABC', value: 'TOGGLE_ABC', colorClass: 'bg-[#6AC9F0] text-[#14213D] font-black border-[#6AC9F0]' },
    { id: 'comma_num', type: 'letter', label: ',', value: ',' },
    { id: 'space_num', type: 'action', label: 'Cách', value: ' ', colorClass: 'bg-white text-[#14213D] font-bold border-[#14213D]/20 flex-2' },
    { id: 'period_num', type: 'letter', label: '.', value: '.' },
    { id: 'action_send_num', type: 'action', label: 'Gửi', value: 'SEND', colorClass: 'bg-[#FF6F61] text-white font-black border-[#FF6F61] flex-1.5' },
  ],
];

// Quick Emergency / Medical Phrases Layout
export const PHRASES_LAYOUT: GridItem[][] = [
  [
    { id: 'p1', type: 'phrase', label: '🆘 Hỗ trợ tôi', value: 'Hỗ trợ tôi.' },
    { id: 'p2', type: 'phrase', label: '😋 Tôi đói bụng', value: 'Tôi cảm thấy đói.' },
    { id: 'p3', type: 'phrase', label: '💧 Tôi khát nước', value: 'Tôi muốn uống nước.' },
    { id: 'p4', type: 'phrase', label: '🚾 Đi vệ sinh', value: 'Tôi cần đi vệ sinh.' }
  ],
  [
    { id: 'p5', type: 'phrase', label: '🤕 Tôi thấy đau', value: 'Tôi thấy đau.' },
    { id: 'p6', type: 'phrase', label: '📞 Gọi người thân', value: 'Tôi muốn gọi người thân.' },
    { id: 'p7', type: 'phrase', label: '🩺 Cần bác sĩ', value: 'Tôi cần bác sĩ.' },
    { id: 'p8', type: 'phrase', label: '🛌 Muốn nghỉ ngơi', value: 'Tôi muốn nghỉ ngơi.' }
  ],
  [
    { id: 'mode_abc_p', type: 'action', label: 'ABC', value: 'TOGGLE_ABC', colorClass: 'bg-[#6AC9F0] text-[#14213D] font-black border-[#6AC9F0]' },
    { id: 'space_p', type: 'action', label: 'Cách', value: ' ', colorClass: 'bg-white text-[#14213D] font-bold border-[#14213D]/20 flex-2' },
    { id: 'backspace_p', type: 'action', label: '⌫ Xóa', value: 'BACKSPACE', colorClass: 'bg-amber-100 text-amber-900 font-bold border-amber-300' },
    { id: 'action_send_p', type: 'action', label: 'Gửi', value: 'SEND', colorClass: 'bg-[#FF6F61] text-white font-black border-[#FF6F61]' },
  ]
];

// Legacy export compatibility
export const KEYBOARD_LAYOUT = QWERTY_LAYOUT;
