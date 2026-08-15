export type FoodImageKey =
  | 'beef-noodle-breakfast'
  | 'egg-toast-breakfast'
  | 'fish-rice-lunch'
  | 'vegetable-soup-dinner'
  | 'fruit-nuts-snack'
  | 'green-tea-drink';

export const FOOD_IMAGE_VERIFIED_AT = '2026-08-09' as const;
export type FoodImageVerifiedAt = typeof FOOD_IMAGE_VERIFIED_AT;

export interface VerifiedFoodImage {
  readonly key: FoodImageKey;
  readonly imageUrl: string;
  readonly sourceUrl: string;
  readonly alt: string;
  readonly license: string;
  readonly author: string;
  readonly verifiedAt: FoodImageVerifiedAt;
}

function verifiedFoodImage(
  key: FoodImageKey,
  imageUrl: string,
  sourceUrl: string,
  alt: string,
  license: string,
  author: string,
): VerifiedFoodImage {
  return Object.freeze({
    key,
    imageUrl,
    sourceUrl,
    alt,
    license,
    author,
    verifiedAt: FOOD_IMAGE_VERIFIED_AT,
  });
}

export const verifiedFoodImages: Readonly<Record<FoodImageKey, VerifiedFoodImage>> = Object.freeze({
  'beef-noodle-breakfast': verifiedFoodImage(
    'beef-noodle-breakfast',
    'https://upload.wikimedia.org/wikipedia/commons/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    'https://commons.wikimedia.org/wiki/File:Beef_noodle_soup_(Ph%E1%BB%9F_b%C3%B2)_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    'Bát phở bò Hà Nội với thịt bò và rau xanh',
    'CC0',
    'Andy Li',
  ),
  'egg-toast-breakfast': verifiedFoodImage(
    'egg-toast-breakfast',
    'https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg',
    'https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg',
    'Bữa sáng với trứng, bánh mì nướng và rau tươi',
    'CC BY-SA 4.0',
    'Deborah Tjituka',
  ),
  'fish-rice-lunch': verifiedFoodImage(
    'fish-rice-lunch',
    'https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg',
    'https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg',
    'Đĩa cơm trắng ăn cùng cá và rau xanh',
    'CC BY-SA 4.0',
    'Cheikh cherif',
  ),
  'vegetable-soup-dinner': verifiedFoodImage(
    'vegetable-soup-dinner',
    'https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG',
    'https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG',
    'Bát canh rau củ mùa xuân dùng cho bữa tối',
    'CC BY-SA 4.0',
    'Kolforn',
  ),
  'fruit-nuts-snack': verifiedFoodImage(
    'fruit-nuts-snack',
    'https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg',
    'https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg',
    'Trái cây tươi và các loại hạt dùng cho bữa phụ',
    'CC0',
    'Roberta Sorge',
  ),
  'green-tea-drink': verifiedFoodImage(
    'green-tea-drink',
    'https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg',
    'https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg',
    'Tách trà xanh ít đường dùng cùng đồ ăn nhẹ',
    'CC BY-SA 4.0',
    'Major Lyte',
  ),
});

export function listVerifiedFoodImages(): ReadonlyArray<VerifiedFoodImage> {
  return Object.freeze(Object.values(verifiedFoodImages));
}
