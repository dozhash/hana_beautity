import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, API_BASE } from '../lib/api';
import { useCart } from '../context/CartContext';
import { t, formatPrice } from '../lib/translations';
import { StarRating } from '../components/StarRating';

const PRODUCTS_PER_PAGE = 10;

interface Category {
  _id: string;
  name: string;
}

interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  images: string[];
  categoryId?: string;
  stock: number;
  rating: number;
  createdAt: string;
}

interface ProductsResponse {
  products: Product[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

function getImageUrl(images: string[] | undefined): string {
  const valid = images?.find((img) => img && (img.startsWith('/') || img.startsWith('http')));
  if (!valid) return '';
  return valid.startsWith('/') ? `${API_BASE}${valid}` : valid;
}

export function Products() {
  const { addToCart } = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCategories = () => {
    api
      .get<Category[]>(`/api/categories`)
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  };

  const [productsCache, setProductsCache] = useState<Record<string, { products: Product[]; hasMore: boolean }>>({});

  const fetchProducts = (categoryId: string | null, pageNum: number, append = false) => {
    const cacheKey = categoryId ?? '__all__';
    const cached = productsCache[cacheKey];
    if (!append) {
      if (cached) {
        // Instant transition: show cached data, no loading state
        setProducts(cached.products);
        setHasMore(cached.hasMore);
      } else {
        setLoading(true);
      }
    }
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    params.set('limit', String(PRODUCTS_PER_PAGE));
    if (categoryId) params.set('categoryId', categoryId);

    const controller = new AbortController();

    api
      .get<ProductsResponse>(`/api/products?${params}`, { signal: controller.signal })
      .then((res) => {
        setProducts((prev) => (append ? [...prev, ...res.data.products] : res.data.products));
        setHasMore(res.data.hasMore);
        if (!append) {
          setProductsCache((prev) => ({
            ...prev,
            [cacheKey]: { products: res.data.products, hasMore: res.data.hasMore },
          }));
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!append) {
          setProducts([]);
          setHasMore(false);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const append = page > 0;
    const abort = fetchProducts(selectedCategoryId, page, append);
    return () => {
      if (typeof abort === 'function') abort();
    };
  }, [selectedCategoryId, page]);

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setPage(0);
  };

  const handleLoadMore = () => {
    setPage((p) => p + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      {categories.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-600 mb-2">{t.categories}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCategorySelect(null)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedCategoryId === null
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-gray-700 shadow-sm hover:bg-gray-50'
              }`}
            >
              {t.all}
            </button>
            {categories.map((cat) => (
              <button
                key={cat._id}
                type="button"
                onClick={() => handleCategorySelect(cat._id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  selectedCategoryId === cat._id
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-gray-700 shadow-sm hover:bg-gray-50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">{t.loadingProducts}</p>
        </div>
      ) : (
        <>
          {loading && products.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-3 text-rose-600">
              <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">{t.loadingProducts}</span>
            </div>
          )}
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 transition-opacity duration-200 ${
              loading && products.length > 0 ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {products.map((product) => (
              <div
                key={product._id}
                className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col"
              >
                <Link
                  to={`/products/${product._id}`}
                  className="block flex-1"
                >
                  <div className="aspect-square bg-gray-100">
                    {getImageUrl(product.images) ? (
                      <img
                        src={getImageUrl(product.images)}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1}
                          stroke="currentColor"
                          className="w-12 h-12"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h2 className="font-medium text-gray-900 line-clamp-2">
                      {product.name}
                    </h2>
                    <p className="mt-1 text-rose-600 font-semibold">
                      {formatPrice(product.price)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t.remainingQuantity}: {product.stock ?? 0}
                    </p>
                    <div className="mt-2">
                      <StarRating rating={product.rating ?? 0} size={12} />
                    </div>
                  </div>
                </Link>
                <div className="p-3 pt-0">
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    className="w-full py-2 px-3 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 transition-colors"
                  >
                    {t.addToCart}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {products.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-500">
              {t.noProductsInCategory}
            </div>
          )}

          {hasMore && products.length > 0 && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
              >
                {t.more}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
