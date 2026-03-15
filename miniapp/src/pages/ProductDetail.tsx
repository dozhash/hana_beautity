import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, API_BASE, captureInitData, getInitData, storeInitData } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useTelegram } from '../context/TelegramContext';
import { t, formatPrice } from '../lib/translations';

interface Product {
  _id: string;
  name: string;
  price: number;
  stock?: number;
  shortDescription?: string;
  fullDescription?: string;
  description?: string;
  howToUse?: string;
  suitableFor?: string;
  whenToUse?: string;
  images: string[];
  recommendedProducts?: Array<{
    _id: string;
    name: string;
    price: number;
    images: string[];
    shortDescription?: string;
  }>;
}

interface Review {
  _id: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface Order {
  _id: string;
  status: string;
  confirmedByAdmin: boolean;
  items: Array<{ productId: string }>;
}

function getImageUrl(img: string | undefined): string {
  if (!img) return '';
  return img.startsWith('/') ? `${API_BASE}${img}` : img;
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get('orderId');
  const writeReviewFromUrl = searchParams.get('writeReview') === '1';
  const { addToCart, showToast } = useCart();
  const { user, initData: contextInitData } = useTelegram();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(writeReviewFromUrl);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(orderIdFromUrl);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [openSection, setOpenSection] = useState<'description' | 'howToUse' | 'suitableFor' | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const fetchProduct = useCallback(() => {
    if (!id) return;
    api
      .get<Product>(`/api/products/${id}/details`)
      .then((res) => setProduct(res.data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ reviews: Review[]; averageRating: number; totalReviews: number }>(
        `/api/products/${id}/reviews?limit=5`
      )
      .then((res) => {
        setReviews(res.data.reviews);
        setAvgRating(res.data.averageRating);
        setTotalReviews(res.data.totalReviews);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (orderIdFromUrl) {
      setReviewOrderId(orderIdFromUrl);
      return;
    }
    if (!id || !user) return;
    api.get<Order[]>('/api/orders/me').then((res) => {
      const confirmed = (res.data ?? []).filter(
        (o) =>
          o.status === 'delivered' &&
          o.confirmedByAdmin &&
          o.items.some((i) => String(i.productId) === id)
      );
      if (confirmed.length > 0) {
        setReviewOrderId(confirmed[0]._id);
      }
    }).catch(() => {});
  }, [id, user, orderIdFromUrl]);

  const submitReview = () => {
    if (!reviewOrderId) return;
    const trimmedComment = reviewComment.trim();
    if (!trimmedComment) return;
    setSubmittingReview(true);
    captureInitData();
    const initData =
      getInitData() ||
      contextInitData ||
      (typeof window !== 'undefined' ? window.Telegram?.WebApp?.initData ?? '' : '') ||
      '';
    if (initData) storeInitData(initData);
    const payload = {
      orderId: reviewOrderId,
      rating: reviewRating,
      comment: reviewComment.trim(),
      ...(initData && { initData }),
    };
    api
      .post(`/api/products/${id}/review`, payload, { timeout: 15000 })
      .then(() => {
        setShowReviewForm(false);
        setReviewComment('');
        showToast(t.thankYouForReview);
        api.get(`/api/products/${id}/reviews?limit=5`).then((res) => {
          setReviews(res.data.reviews);
          setAvgRating(res.data.averageRating);
          setTotalReviews(res.data.totalReviews);
        });
      })
      .catch((err: { response?: { data?: { error?: string }; status?: number }; code?: string }) => {
        const msg =
          err?.response?.status === 401
            ? t.openFromTelegramForReview
            : err?.code === 'ECONNABORTED'
            ? t.requestTimedOut
            : err?.response?.data?.error ?? t.failedToSubmitReview;
        showToast(msg);
      })
      .finally(() => setSubmittingReview(false));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">{t.loadingProduct}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-gray-600">{t.productNotFound}</p>
        <Link to="/products" className="text-rose-600 font-medium hover:underline">
          {t.backToProducts}
        </Link>
      </div>
    );
  }

  const desc = product.fullDescription || product.shortDescription || product.description;
  const suitableFor = product.suitableFor || product.whenToUse;
  const images = (product.images ?? [])
    .filter((img): img is string => Boolean(img && (img.startsWith('/') || img.startsWith('http'))));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Link
        to="/products"
        className="inline-flex items-center text-gray-600 hover:text-gray-900 p-4"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-5 h-5 mr-2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        {t.back}
      </Link>

      <div className="px-4">
        {/* Image gallery - swipeable */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <div className="aspect-square bg-gray-100 relative overflow-hidden">
            {images.length > 0 ? (
              <>
                <div
                  ref={galleryRef}
                  className="gallery-scroll flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    WebkitOverflowScrolling: 'touch',
                  }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const slideWidth = el.clientWidth;
                    if (slideWidth > 0) {
                      const idx = Math.round(el.scrollLeft / slideWidth);
                      setGalleryIndex(Math.min(Math.max(0, idx), images.length - 1));
                    }
                  }}
                >
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="min-w-full w-full flex-shrink-0 snap-center snap-always flex items-center justify-center bg-gray-100"
                      style={{ aspectRatio: '1' }}
                    >
                      <img
                        src={getImageUrl(img)}
                        alt={`${product.name} ${i + 1}`}
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (galleryRef.current) {
                            galleryRef.current.scrollTo({ left: i * galleryRef.current.clientWidth, behavior: 'smooth' });
                            setGalleryIndex(i);
                          }
                        }}
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          i === galleryIndex ? 'bg-rose-600' : 'bg-white/80 hover:bg-white'
                        }`}
                        aria-label={`${t.viewImage} ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                  className="w-24 h-24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="mt-2 text-3xl font-semibold text-rose-600">
            {formatPrice(product.price)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {t.remainingQuantity}: {product.stock ?? 0}
          </p>

          {(desc || product.howToUse || suitableFor) && (
            <div className="mt-6 flex flex-col gap-2">
              {desc && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenSection((s) => (s === 'description' ? null : 'description'))}
                    className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left font-medium text-gray-900 transition-colors"
                  >
                    <span>{t.description}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`w-5 h-5 flex-shrink-0 ml-2 transition-transform ${openSection === 'description' ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {openSection === 'description' && (
                    <div className="mt-2 px-4 py-3 bg-gray-50 rounded-xl">
                      <p className="text-gray-600 leading-relaxed whitespace-pre-line text-sm">{desc}</p>
                    </div>
                  )}
                </div>
              )}
              {product.howToUse && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenSection((s) => (s === 'howToUse' ? null : 'howToUse'))}
                    className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left font-medium text-gray-900 transition-colors"
                  >
                    <span>{t.howToUse}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`w-5 h-5 flex-shrink-0 ml-2 transition-transform ${openSection === 'howToUse' ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {openSection === 'howToUse' && (
                    <div className="mt-2 px-4 py-3 bg-gray-50 rounded-xl">
                      <p className="text-gray-600 leading-relaxed whitespace-pre-line text-sm">{product.howToUse}</p>
                    </div>
                  )}
                </div>
              )}
              {suitableFor && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenSection((s) => (s === 'suitableFor' ? null : 'suitableFor'))}
                    className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left font-medium text-gray-900 transition-colors"
                  >
                    <span>{t.suitableFor}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`w-5 h-5 flex-shrink-0 ml-2 transition-transform ${openSection === 'suitableFor' ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {openSection === 'suitableFor' && (
                    <div className="mt-2 px-4 py-3 bg-gray-50 rounded-xl">
                      <p className="text-gray-600 leading-relaxed whitespace-pre-line text-sm">{suitableFor}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => addToCart(product)}
            className="mt-6 w-full py-3 px-4 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
          >
            {t.addToCart}
          </button>
        </div>

        {/* Reviews */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">⭐ {t.reviews}</h2>
          {totalReviews > 0 && (
            <p className="text-sm text-gray-600 mb-4">
              {avgRating.toFixed(1)} {t.avg} · {totalReviews} {totalReviews !== 1 ? t.reviewsCount : t.review}
            </p>
          )}
          {reviewOrderId && !showReviewForm && (
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              className="mb-4 px-4 py-2 bg-rose-100 text-rose-700 text-sm font-medium rounded-lg hover:bg-rose-200"
            >
              {t.writeReview}
            </button>
          )}
          {showReviewForm && reviewOrderId && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium mb-3">{t.yourReview}</h3>
              <p className="text-sm text-gray-600 mb-3">{t.rateAndShareExperience}</p>
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className={`text-2xl ${star <= reviewRating ? 'text-amber-400' : 'text-gray-300'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={t.shareExperiencePlaceholder}
                className="w-full p-3 border border-gray-200 rounded-lg mb-3 text-sm"
                rows={3}
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitReview}
                  disabled={submittingReview || !reviewComment.trim()}
                  className="px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submittingReview ? t.submitting : t.submit}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
          {reviews.length === 0 && !showReviewForm ? (
            <p className="text-gray-500">{t.noReviewsYet}</p>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r._id} className="border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={star <= r.rating ? 'text-amber-400' : 'text-gray-300'}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  {r.comment && <p className="text-gray-600 text-sm">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recommended */}
        {product.recommendedProducts && product.recommendedProducts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t.youMayAlsoLike}</h2>
            <div className="grid grid-cols-2 gap-4">
              {product.recommendedProducts.map((rec) => (
                <Link
                  key={rec._id}
                  to={`/products/${rec._id}`}
                  className="block bg-gray-50 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-200">
                    {getImageUrl(rec.images?.[0]) ? (
                      <img
                        src={getImageUrl(rec.images?.[0])}
                        alt={rec.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <span className="text-3xl">📦</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 line-clamp-2">{rec.name}</h3>
                    <p className="text-rose-600 font-semibold">{formatPrice(rec.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
