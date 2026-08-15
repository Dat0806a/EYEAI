export type FoodImageKey =
  | 'beef-noodle-breakfast'
  | 'egg-toast-breakfast'
  | 'fish-rice-lunch'
  | 'vegetable-soup-dinner'
  | 'fruit-nuts-snack'
  | 'green-tea-drink';

export interface VerifiedFoodImage {
  key: FoodImageKey;
  imageUrl: string;
  sourceUrl: string;
  alt: string;
  license: string;
  author: string;
}

export const VERIFIED_FOOD_IMAGES: Record<FoodImageKey, VerifiedFoodImage> = {
  'beef-noodle-breakfast': {
    key: 'beef-noodle-breakfast',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Beef_noodle_soup_(Ph%E1%BB%9F_b%C3%B2)_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
    alt: 'Bát phở bò Hà Nội với thịt bò và rau xanh',
    license: 'CC0',
    author: 'Andy Li',
  },
  'egg-toast-breakfast': {
    key: 'egg-toast-breakfast',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Healthy_egg_and_toasted_bread_breakfast.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Healthy_egg_and_toasted_bread_breakfast.jpg',
    alt: 'Bữa sáng với trứng, bánh mì nướng và rau tươi',
    license: 'CC BY-SA 4.0',
    author: 'Deborah Tjituka',
  },
  'fish-rice-lunch': {
    key: 'fish-rice-lunch',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Riz_blanc_au_poisson.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Riz_blanc_au_poisson.jpg',
    alt: 'Đĩa cơm trắng ăn cùng cá và rau xanh',
    license: 'CC BY-SA 4.0',
    author: 'Cheikh cherif',
  },
  'vegetable-soup-dinner': {
    key: 'vegetable-soup-dinner',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/-2022-02-01_Bowl_of_spring_vegetable_soup%2C_Trimingham%2C_Norfolk.JPG',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:-2022-02-01_Bowl_of_spring_vegetable_soup,_Trimingham,_Norfolk.JPG',
    alt: 'Bát canh rau củ mùa xuân dùng cho bữa tối',
    license: 'CC BY-SA 4.0',
    author: 'Kolforn',
  },
  'fruit-nuts-snack': {
    key: 'fruit-nuts-snack',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Nuts_and_Fruit_%28Unsplash%29.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nuts_and_Fruit_(Unsplash).jpg',
    alt: 'Trái cây tươi và các loại hạt dùng cho bữa phụ',
    license: 'CC0',
    author: 'Roberta Sorge',
  },
  'green-tea-drink': {
    key: 'green-tea-drink',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Cup_of_Green_Tea_and_Snacks.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cup_of_Green_Tea_and_Snacks.jpg',
    alt: 'Tách trà xanh ít đường dùng cùng đồ ăn nhẹ',
    license: 'CC BY-SA 4.0',
    author: 'Major Lyte',
  },
};

export type ExerciseVideoKey = 'walk-at-home' | 'beginner-yoga' | 'chair-yoga';

export interface VerifiedExerciseVideo {
  key: ExerciseVideoKey;
  videoId: string;
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  youtubeUrl: string;
}

export const VERIFIED_EXERCISE_VIDEOS: Record<ExerciseVideoKey, VerifiedExerciseVideo> = {
  'walk-at-home': {
    key: 'walk-at-home',
    videoId: 'u08lo0bESJc',
    title: 'Heart Healthy - 1 Mile Walk | Walk at Home',
    authorName: 'Walk at Home',
    authorUrl: 'https://www.youtube.com/@LeslieSansonesWalkatHome',
    thumbnailUrl: 'https://i.ytimg.com/vi/u08lo0bESJc/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=u08lo0bESJc',
  },
  'beginner-yoga': {
    key: 'beginner-yoga',
    videoId: 'v7AYKMP6rOE',
    title: 'Yoga For Complete Beginners - 20 Minute Home Yoga Workout!',
    authorName: 'Yoga With Adriene',
    authorUrl: 'https://www.youtube.com/@yogawithadriene',
    thumbnailUrl: 'https://i.ytimg.com/vi/v7AYKMP6rOE/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=v7AYKMP6rOE',
  },
  'chair-yoga': {
    key: 'chair-yoga',
    videoId: '1DYH5ud3zHo',
    title: 'Gentle Chair Yoga for Beginners and Seniors',
    authorName: 'Yoga with Kassandra',
    authorUrl: 'https://www.youtube.com/@yogawithkassandra',
    thumbnailUrl: 'https://i.ytimg.com/vi/1DYH5ud3zHo/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=1DYH5ud3zHo',
  },
};
