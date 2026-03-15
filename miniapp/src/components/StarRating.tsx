import { t } from '../lib/translations';

interface StarRatingProps {
  /** Average rating 0-5. 0 or undefined = no reviews (all gray) */
  rating?: number;
  /** Size of stars in pixels */
  size?: number;
  className?: string;
}

/**
 * Displays 5 stars: gray by default (no reviews), yellow filled based on average rating.
 * Supports partial stars (e.g. 3.5 = 3 full + 1 half yellow).
 */
export function StarRating({ rating = 0, size = 14, className = '' }: StarRatingProps) {
  const hasReviews = rating > 0;
  const filledCount = Math.floor(rating);
  const partial = rating - filledCount; // 0-0.99 for the next star

  const StarSvg = ({ filled, partialFill = 0 }: { filled: boolean; partialFill?: number }) => (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {/* Gray background star */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-gray-300"
        width={size}
        height={size}
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {/* Yellow overlay (full or partial) */}
      {(filled || partialFill > 0) && (
        <span
          className="absolute inset-0 overflow-hidden text-yellow-500"
          style={{ width: filled ? '100%' : `${partialFill * 100}%` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </span>
      )}
    </span>
  );

  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={t.starRatingAria(rating)}>
      {[0, 1, 2, 3, 4].map((i) => {
        if (!hasReviews) {
          return <StarSvg key={i} filled={false} />;
        }
        if (i < filledCount) {
          return <StarSvg key={i} filled={true} />;
        }
        if (i === filledCount && partial > 0) {
          return <StarSvg key={i} filled={false} partialFill={partial} />;
        }
        return <StarSvg key={i} filled={false} />;
      })}
    </div>
  );
}
