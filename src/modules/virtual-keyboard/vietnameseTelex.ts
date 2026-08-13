export function applyVietnameseAccents(text: string): string {
  if (!text) return '';

  const combinations: Record<string, string> = {
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
    'As': 'Á', 'Af': 'À', 'Ar': 'Ả', 'Ax': 'Ã', 'Aj': 'Ạ',
  };

  if (text.length >= 2) {
    const lastTwo = text.slice(-2);
    if (combinations[lastTwo]) {
      return text.slice(0, -2) + combinations[lastTwo];
    }
  }

  return text;
}
