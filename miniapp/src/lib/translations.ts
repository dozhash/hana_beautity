/**
 * Uzbek translations for the client-facing miniapp.
 */

/** Format price with Uzbek so'm */
export function formatPrice(price: number): string {
  const isWhole = Number.isInteger(price) || price === Math.round(price);
  const numStr = isWhole
    ? Math.round(price).toString()
    : parseFloat(price.toFixed(10)).toString();
  const [intPart, decPart] = numStr.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const result = decPart ? `${formattedInt}.${decPart}` : formattedInt;
  return `${result} so'm`;
}

export const t = {
  categories: 'Kategoriyalar',
  all: 'Hammasi',
  loadingProducts: 'Mahsulotlar yuklanmoqda...',
  remainingQuantity: 'Qolgan miqdor',
  addToCart: "Savatga qo'shish",
  noProductsInCategory: "Bu kategoriyada hali mahsulot yo'q.",
  more: "Ko'proq",

  loadingProduct: 'Mahsulot yuklanmoqda...',
  productNotFound: 'Mahsulot topilmadi',
  backToProducts: "Mahsulotlarga qaytish",
  back: 'Orqaga',
  description: 'Tavsif',
  howToUse: "Qo'llash usuli",
  suitableFor: "Kimlar uchun?",
  reviews: 'Sharhlar',
  review: 'sharh',
  reviewsCount: 'sharh',
  avg: "o'rt",
  writeReview: 'Sharh yozing',
  yourReview: 'Sizning sharhingiz',
  rateAndShareExperience: '1–5 yulduz bilan baholang va tajribangizni yozing.',
  shareExperiencePlaceholder: "Bu mahsulot haqida tajribangizni baham ko'ring...",
  submitting: 'Yuborilmoqda...',
  submit: 'Yuborish',
  cancel: 'Bekor qilish',
  noReviewsYet: "Hali sharhlar yo'q.",
  youMayAlsoLike: 'Sizga ham yoqishi mumkin',
  thankYouForReview: 'Sharhingiz uchun rahmat!',
  openFromTelegramForReview: 'Sharh qoldirish uchun ilovani Telegram orqali oching.',
  requestTimedOut: "So'rov vaqti tugadi. Qayta urinib ko'ring.",
  failedToSubmitReview: "Sharh yuborib bo'lmadi.",

  phoneRequired: 'Telefon raqami talab qilinadi',
  phoneFormatError: 'Faqat raqamlar va ixtiyoriy + belgisi ruxsat etilgan (masalan: +998901234567)',
  phoneLengthError: "Iltimos, to'g'ri telefon raqamini kiriting (9–15 raqam)",
  invalidPhone: "Noto'g'ri telefon raqami",
  failedToPlaceOrder: "Buyurtma berib bo'lmadi. Qayta urinib ko'ring.",
  cartEmpty: "Savat bo'sh",
  browseProducts: "Mahsulotlarni ko'rish",
  orderSuccessful: 'Buyurtma muvaffaqiyatli yakunlandi',
  yourOrderNumber: 'Buyurtma raqamingiz',
  weWillContactYou: "Tez orada siz bilan bog'lanamiz.",
  viewOrders: "Buyurtmalarni ko'rish",
  continueShopping: 'Xaridni davom ettirish',
  contactAdmin: "Admin bilan bog'lanish",
  checkout: "To'lov",
  enterPhoneToComplete: 'Buyurtmani yakunlash uchun telefon raqamingizni kiriting',
  phoneNumber: 'Telefon raqami',
  phonePlaceholder: '+998901234567 yoki 901234567',
  digitsOnlyHint: "Faqat raqamlar. Misol: +998901234567, 901234567",
  backToCart: "Savatga qaytish",
  processing: 'Qayta ishlanmoqda...',
  placeOrder: 'Buyurtma berish',
  total: 'Jami',
  remove: "O'chirish",

  myOrders: 'Mening buyurtmalarim',
  loadingOrders: 'Buyurtmalar yuklanmoqda...',
  openFromTelegram:
    "Buyurtmalaringizni ko'rish uchun ilovani Telegram orqali oching. Telegram menyusidagi tugmani bosing va do'konni oching.",
  noOrdersYet: "Hali buyurtmalar yo'q.",
  order: 'Buyurtma',
  orderNumberLabel: 'Buyurtma',
  products: 'Mahsulotlar',
  receivedOrder: 'Buyurtmani qabul qildim',

  loadingOrder: 'Buyurtma yuklanmoqda...',
  orderNotFound: 'Buyurtma topilmadi',
  backToOrders: "Buyurtmalarga qaytish",
  leaveReview: 'Sharh qoldiring',
  orderDeliveredShareExperience:
    "Buyurtmangiz yetkazib berildi. Ushbu mahsulotlar haqida tajribangizni baham ko'ring:",
  writeReviewLink: 'Sharh yozish',

  statusPending: 'Kutilmoqda',
  statusPaid: "To'langan",
  statusPreparing: 'Tayyorlanmoqda',
  statusShipped: 'Yuborilgan',
  statusDelivered: 'Yetkazilgan',
  statusCancelled: 'Bekor qilindi',

  navProducts: 'Mahsulotlar',
  navCart: 'Savat',
  navOrders: 'Buyurtmalarim',

  addedToCart: "Savatga qo'shildi",
  removedFromCart: "Savatdan o'chirildi",

  decreaseQuantity: "Miqdorni kamaytirish",
  increaseQuantity: "Miqdorni oshirish",
  refreshOrders: "Buyurtmalarni yangilash",
  refresh: 'Yangilash',
  viewCart: "Savatni ko'rish",
  viewImage: "Rasmni ko'rish",
  starRatingAria: (rating: number) => `Baholash: ${rating.toFixed(1)} 5 dan`,
} as const;

export type TranslationKey = keyof typeof t;
