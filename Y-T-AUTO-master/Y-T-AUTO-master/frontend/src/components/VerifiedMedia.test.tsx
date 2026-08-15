import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExercisePlanItem, MealPlanItem } from '../types';
import { VerifiedMedia } from './VerifiedMedia';

const verifiedMeal: MealPlanItem = {
  mealType: 'BREAKFAST',
  name: 'Cháo yến mạch',
  description: 'Bữa sáng nhẹ nhàng',
  ingredients: 'Yến mạch, chuối',
  preparation: 'Nấu chín',
  rationale: 'Giàu chất xơ',
  imageUrl: 'https://images.example/oatmeal.jpg',
  imageAlt: 'Bát cháo yến mạch với chuối thái lát',
  imageSourceUrl: 'https://source.example/oatmeal',
  imageLicense: 'CC BY 4.0',
  imageAuthor: 'Minh Anh',
  imageVerifiedAt: '2026-08-09T00:00:00.000Z',
};

const verifiedExercise: ExercisePlanItem = {
  name: 'Đi bộ tại chỗ',
  description: 'Vận động nhẹ',
  duration: 10,
  difficulty: 'EASY',
  rationale: 'Hỗ trợ tuần hoàn',
  youtubeUrl: 'https://www.youtube.com/watch?v=verified123',
  youtubeVideoId: 'verified123',
  youtubeTitle: '10 phút đi bộ tại nhà',
  youtubeAuthor: 'Kênh Sống Khỏe',
  youtubeAuthorUrl: 'https://www.youtube.com/@songkhoe',
  youtubeThumbnailUrl: 'https://i.ytimg.com/vi/verified123/hqdefault.jpg',
  youtubeVerified: true,
  youtubeSource: 'YouTube oEmbed',
  youtubeVerifiedAt: '2026-08-09T00:00:00.000Z',
};

describe('VerifiedMedia', () => {
  it('renders a verified meal image lazily with accessible attribution', () => {
    render(<VerifiedMedia kind="meal" item={verifiedMeal} />);

    const image = screen.getByRole('img', { name: verifiedMeal.imageAlt });
    expect(image).toHaveAttribute('src', verifiedMeal.imageUrl);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText(verifiedMeal.imageAuthor)).toBeVisible();
    expect(screen.getByText(verifiedMeal.imageLicense)).toBeVisible();
    expect(screen.getByRole('link', { name: /xem nguồn ảnh/i })).toHaveAttribute(
      'href',
      verifiedMeal.imageSourceUrl,
    );
    expect(screen.getByRole('link', { name: /xem nguồn ảnh/i })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /xem nguồn ảnh/i })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('replaces a failed meal image with an accessible fallback and keeps attribution', () => {
    render(<VerifiedMedia kind="meal" item={verifiedMeal} />);

    fireEvent.error(screen.getByRole('img', { name: verifiedMeal.imageAlt }));

    expect(screen.queryByRole('img', { name: verifiedMeal.imageAlt })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Không thể tải ảnh món ăn');
    expect(screen.getByText(verifiedMeal.imageAuthor)).toBeVisible();
    expect(screen.getByRole('link', { name: /xem nguồn ảnh/i })).toHaveAttribute(
      'href',
      verifiedMeal.imageSourceUrl,
    );
  });

  it('shows a new verified image after a previously failed image source changes', () => {
    const replacementMeal: MealPlanItem = {
      ...verifiedMeal,
      imageUrl: 'https://images.example/replacement-oatmeal.jpg',
      imageAlt: 'Bát cháo yến mạch mới với quả mọng',
    };
    const { rerender } = render(<VerifiedMedia kind="meal" item={verifiedMeal} />);

    fireEvent.error(screen.getByRole('img', { name: verifiedMeal.imageAlt }));
    expect(screen.getByRole('status')).toBeVisible();

    rerender(<VerifiedMedia kind="meal" item={replacementMeal} />);

    expect(screen.getByRole('img', { name: replacementMeal.imageAlt })).toHaveAttribute(
      'src',
      replacementMeal.imageUrl,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not render meal media when the verified tuple is incomplete at runtime', () => {
    const incompleteMeal = { ...verifiedMeal, imageLicense: '' } as MealPlanItem;

    const { container } = render(<VerifiedMedia kind="meal" item={incompleteMeal} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders verified YouTube title, author, and safe external link', () => {
    render(<VerifiedMedia kind="exercise" item={verifiedExercise} />);

    expect(screen.getByText(verifiedExercise.youtubeTitle)).toBeVisible();
    expect(screen.getByText(verifiedExercise.youtubeAuthor)).toBeVisible();
    const link = screen.getByRole('link', { name: /xem video/i });
    expect(link).toHaveAttribute('href', verifiedExercise.youtubeUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['youtubeUrl', '   '],
    ['youtubeVideoId', '   '],
    ['youtubeTitle', '   '],
    ['youtubeAuthor', '   '],
    ['youtubeAuthorUrl', '   '],
    ['youtubeThumbnailUrl', '   '],
    ['youtubeVerifiedAt', '   '],
    ['youtubeSource', 'Unverified source'],
  ] as const)('does not render verified YouTube media when %s is malformed', (field, value) => {
    const malformedExercise = {
      ...verifiedExercise,
      [field]: value,
    } as unknown as ExercisePlanItem;

    const { container } = render(<VerifiedMedia kind="exercise" item={malformedExercise} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not render a YouTube link when the item is unverified even if a URL is present at runtime', () => {
    const unverifiedWithUrl = {
      ...verifiedExercise,
      youtubeVerified: false,
      youtubeUrl: 'https://www.youtube.com/watch?v=unverified',
    } as unknown as ExercisePlanItem;

    const { container } = render(<VerifiedMedia kind="exercise" item={unverifiedWithUrl} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
