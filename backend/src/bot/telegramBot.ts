import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { Category } from '../models/Category.model.js';
import { Review } from '../models/Review.js';
import { processTelegramImage } from '../utils/processTelegramImage.js';
import { formatPrice } from '../utils/formatPrice.js';
let bot: TelegramBot | null = null;

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? '';

type AdminFlow =
  | 'addproduct'
  | 'deleteproduct'
  | 'addcategory'
  | 'deletecategory'
  | 'editproduct';

type EditProductStep = 'name' | 'price' | 'description' | 'howToUse' | 'suitableFor' | 'image' | 'category' | 'quantity';

interface AdminState {
  flow: AdminFlow;
  step: number | EditProductStep;
  data: Record<string, string>;
}

const adminState = new Map<number, AdminState>();

interface BrowseState {
  flow: string;
  categoryId: string;
  page: number;
}

const browseState = new Map<number, BrowseState>();

interface ReviewModerationState {
  flow: 'reviewModeration';
  step: 'category' | 'product' | 'reviews';
  categoryId?: string;
  productId?: string;
  page: number;
  reviewIndex: number;
}

const reviewModerationState = new Map<number, ReviewModerationState>();

const PRODUCTS_PER_PAGE = 5;
const REVIEWS_PER_PAGE = 5;
const PHOTO_BATCH_DELAY_MS = 700;

/** User-level buffer: collect all photos within a window, then confirm once */
const userPhotoBuffer = new Map<
  number,
  {
    fileIds: string[];
    chatId: number;
    flow: 'addproduct' | 'editproduct';
    timeout: ReturnType<typeof setTimeout>;
    captionDone?: boolean;
  }
>();

function isAdmin(userId: number): boolean {
  return Boolean(ADMIN_TELEGRAM_ID && String(userId) === ADMIN_TELEGRAM_ID);
}

function sendAccessDenied(chatId: number): void {
  bot!.sendMessage(chatId, 'Access denied. Admin only.');
}

function getBuyerKeyboard(miniappUrl: string) {
  return {
    keyboard: [
      [{ text: '🛍 Open Shop', web_app: { url: miniappUrl } }],
      [{ text: 'ℹ️ Help' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

function getAdminReplyKeyboard(miniappUrl: string) {
  return {
    keyboard: [
      [{ text: '🛍 Open Shop', web_app: { url: miniappUrl } }],
      [{ text: '➕ Add Product' }],
      [{ text: '📦 Products' }, { text: '📂 Categories' }],
      [{ text: '🧾 Orders' }, { text: '⭐ Reviews' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

async function setupBotCommands(botInstance: TelegramBot): Promise<void> {
  const defaultCommands = [
    { command: 'shop', description: 'Open Nur Cosmetics shop' },
    { command: 'help', description: 'Get help' },
  ];

  const adminCommands = [
    { command: 'admin', description: 'Open admin panel' },
    { command: 'addproduct', description: 'Add new product' },
    { command: 'products', description: 'Manage products' },
    { command: 'categories', description: 'Manage categories' },
    { command: 'orders', description: 'View orders' },
    { command: 'reviews', description: 'Moderate product reviews' },
  ];

  await botInstance.setMyCommands(defaultCommands);

  if (ADMIN_TELEGRAM_ID) {
    try {
      await botInstance.setMyCommands(adminCommands, {
        scope: { type: 'chat', chat_id: Number(ADMIN_TELEGRAM_ID) },
      });
    } catch {
      console.warn('Could not set admin commands. Ensure admin has started a chat with the bot.');
    }
  }
}

function getAdminMenuKeyboard(miniappUrl: string) {
  return {
    inline_keyboard: [
      [{ text: '🛍 Open Shop', web_app: { url: miniappUrl } }],
      [{ text: '➕ Add Product', callback_data: 'admin_addproduct' }],
      [{ text: '📦 View Products', callback_data: 'admin_products' }],
      [{ text: '📋 View Orders', callback_data: 'admin_orders' }],
      [{ text: '⭐ Moderate Reviews', callback_data: 'admin_reviews' }],
      [{ text: '📁 Categories', callback_data: 'admin_categories' }],
    ],
  };
}

function handleAdminMenu(chatId: number, miniappUrl: string): void {
  bot!.sendMessage(chatId, 'Admin Menu', {
    reply_markup: getAdminMenuKeyboard(miniappUrl),
  });
}

async function sendCategoriesForBrowse(
  chatId: number,
  userId: number,
  isAdminUser: boolean
): Promise<void> {
  const categories = await Category.find().sort({ name: 1 });
  if (categories.length === 0) {
    bot!.sendMessage(chatId, 'No categories found.');
    return;
  }
  const inlineKeyboard = categories.map((c) => [
    { text: c.name, callback_data: `category_${c._id}` },
  ]);
  bot!.sendMessage(chatId, 'Select a category:', {
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function sendProductsPage(
  chatId: number,
  userId: number,
  categoryId: string,
  page: number,
  isAdminUser: boolean
): Promise<void> {
  browseState.set(userId, { flow: 'browse_products', categoryId, page });

  const [products, totalCount] = await Promise.all([
    Product.find({ categoryId: new mongoose.Types.ObjectId(categoryId) })
      .sort({ createdAt: -1 })
      .skip(page * PRODUCTS_PER_PAGE)
      .limit(PRODUCTS_PER_PAGE),
    Product.countDocuments({ categoryId: new mongoose.Types.ObjectId(categoryId) }),
  ]);

  const hasMore = (page + 1) * PRODUCTS_PER_PAGE < totalCount;

  if (products.length === 0 && page === 0) {
    bot!.sendMessage(chatId, 'No products in this category.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Back to Categories', callback_data: 'back_categories' }]],
      },
    });
    return;
  }

  const productLines = products.map(
    (p, i) => `${page * PRODUCTS_PER_PAGE + i + 1}. ${p.name} - ${formatPrice(p.price)}`
  );
  const text = productLines.join('\n');

  const buttons: { text: string; callback_data: string }[][] = [];
  if (isAdminUser) {
    products.forEach((p, i) => {
      const n = page * PRODUCTS_PER_PAGE + i + 1;
      buttons.push([
        { text: `✏️ Edit ${n}`, callback_data: `edit_${p._id}` },
        { text: `🗑 Delete ${n}`, callback_data: `delete_${p._id}` },
      ]);
    });
  }
  buttons.push(
    hasMore
      ? [
          { text: 'More', callback_data: `more_${categoryId}_${page + 1}` },
          { text: 'Back to Categories', callback_data: 'back_categories' },
        ]
      : [{ text: 'Back to Categories', callback_data: 'back_categories' }]
  );

  bot!.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendProductsPageMore(
  chatId: number,
  userId: number,
  categoryId: string,
  page: number,
  isAdminUser: boolean
): Promise<void> {
  const [products, totalCount] = await Promise.all([
    Product.find({ categoryId: new mongoose.Types.ObjectId(categoryId) })
      .sort({ createdAt: -1 })
      .skip(page * PRODUCTS_PER_PAGE)
      .limit(PRODUCTS_PER_PAGE),
    Product.countDocuments({ categoryId: new mongoose.Types.ObjectId(categoryId) }),
  ]);

  const hasMore = (page + 1) * PRODUCTS_PER_PAGE < totalCount;

  if (products.length === 0) {
    bot!.sendMessage(chatId, 'No more products in this category.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Back to Categories', callback_data: 'back_categories' }]],
      },
    });
    return;
  }

  const productLines = products.map(
    (p, i) => `${page * PRODUCTS_PER_PAGE + i + 1}. ${p.name} - ${formatPrice(p.price)}`
  );
  const text = productLines.join('\n');

  browseState.set(userId, { flow: 'browse_products', categoryId, page });

  const buttons: { text: string; callback_data: string }[][] = [];
  if (isAdminUser) {
    products.forEach((p, i) => {
      const n = page * PRODUCTS_PER_PAGE + i + 1;
      buttons.push([
        { text: `✏️ Edit ${n}`, callback_data: `edit_${p._id}` },
        { text: `🗑 Delete ${n}`, callback_data: `delete_${p._id}` },
      ]);
    });
  }
  buttons.push(
    hasMore
      ? [
          { text: 'More', callback_data: `more_${categoryId}_${page + 1}` },
          { text: 'Back to Categories', callback_data: 'back_categories' },
        ]
      : [{ text: 'Back to Categories', callback_data: 'back_categories' }]
  );

  bot!.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

function clearAdminState(userId: number): void {
  adminState.delete(userId);
}

function clearReviewModerationState(userId: number): void {
  reviewModerationState.delete(userId);
}

async function sendReviewCategories(chatId: number, userId: number): Promise<void> {
  const categories = await Category.find().sort({ name: 1 });
  if (categories.length === 0) {
    bot!.sendMessage(chatId, 'No categories found.');
    return;
  }
  reviewModerationState.set(userId, {
    flow: 'reviewModeration',
    step: 'category',
    page: 0,
    reviewIndex: 0,
  });
  bot!.sendMessage(chatId, 'Select a category to view reviews:', {
    reply_markup: {
      inline_keyboard: categories.map((c) => [
        { text: c.name, callback_data: `review_category_${c._id}` },
      ]),
    },
  });
}

async function sendReviewProducts(chatId: number, userId: number, categoryId: string): Promise<void> {
  const products = await Product.find({ categoryId: new mongoose.Types.ObjectId(categoryId) })
    .sort({ name: 1 })
    .lean();
  if (products.length === 0) {
    bot!.sendMessage(chatId, 'No products in this category.');
    return;
  }
  reviewModerationState.set(userId, {
    flow: 'reviewModeration',
    step: 'product',
    categoryId,
    page: 0,
    reviewIndex: 0,
  });
  bot!.sendMessage(chatId, 'Select a product:', {
    reply_markup: {
      inline_keyboard: products.map((p) => [
        { text: p.name, callback_data: `review_product_${p._id}` },
      ]),
    },
  });
}

async function sendReviewForProduct(
  chatId: number,
  userId: number,
  productId: string,
  page: number,
  reviewIndex: number
): Promise<void> {
  const product = await Product.findById(productId).lean();
  if (!product) {
    bot!.sendMessage(chatId, 'Product not found.');
    return;
  }
  const [reviews, totalCount] = await Promise.all([
    Review.find({ productId: new mongoose.Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .skip(page * REVIEWS_PER_PAGE)
      .limit(REVIEWS_PER_PAGE)
      .lean(),
    Review.countDocuments({ productId: new mongoose.Types.ObjectId(productId) }),
  ]);

  if (reviews.length === 0 && page === 0) {
    bot!.sendMessage(chatId, 'No reviews found for this product.');
    const state = reviewModerationState.get(userId);
    if (state?.categoryId) {
      await sendReviewProducts(chatId, userId, state.categoryId);
    }
    return;
  }

  if (reviewIndex >= reviews.length) {
    if (page === 0 && totalCount === 0) {
      bot!.sendMessage(chatId, 'No reviews found for this product.');
      const state = reviewModerationState.get(userId);
      if (state?.categoryId) {
        await sendReviewProducts(chatId, userId, state.categoryId);
      }
      return;
    }
    if (page === 0) {
      reviewIndex = reviews.length - 1;
    } else {
      const prevPage = page - 1;
      const prevReviews = await Review.find({ productId: new mongoose.Types.ObjectId(productId) })
        .sort({ createdAt: -1 })
        .skip(prevPage * REVIEWS_PER_PAGE)
        .limit(REVIEWS_PER_PAGE)
        .lean();
      reviewModerationState.set(userId, {
        flow: 'reviewModeration',
        step: 'reviews',
        productId,
        page: prevPage,
        reviewIndex: prevReviews.length - 1,
      });
      sendSingleReview(chatId, product.name, prevReviews[prevReviews.length - 1]!, productId, prevPage, prevReviews.length - 1, totalCount, product.categoryId?.toString());
      return;
    }
  }

  reviewModerationState.set(userId, {
    flow: 'reviewModeration',
    step: 'reviews',
    productId,
    categoryId: product.categoryId?.toString(),
    page,
    reviewIndex,
  });
  sendSingleReview(chatId, product.name, reviews[reviewIndex]!, productId, page, reviewIndex, totalCount, product.categoryId?.toString());
}

function sendSingleReview(
  chatId: number,
  productName: string,
  review: { _id: mongoose.Types.ObjectId; userId: string; rating: number; comment: string; createdAt: Date },
  productId: string,
  page: number,
  reviewIndex: number,
  totalCount: number,
  categoryId?: string
): void {
  const totalShown = page * REVIEWS_PER_PAGE + reviewIndex + 1;
  const dateStr = new Date(review.createdAt).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const text =
    `*Product:* ${productName}\n\n` +
    `⭐ *Rating:* ${review.rating}/5\n` +
    `*User:* Anonymous\n` +
    `*Review:*\n${review.comment || '(no comment)'}\n\n` +
    `*Date:* ${dateStr}\n\n` +
    `_Review ${totalShown} of ${totalCount}_`;

  const hasNext = totalShown < totalCount;
  const row1: { text: string; callback_data: string }[] = [
    { text: '🗑 Delete Review', callback_data: `delete_review_${review._id}` },
  ];
  if (hasNext) {
    row1.push({ text: '➡️ Next Review', callback_data: `next_review_${productId}_${page}_${reviewIndex}` });
  }
  const backData = categoryId ? `review_back_products_${categoryId}` : `review_back_category`;
  const buttons: { text: string; callback_data: string }[][] = [row1, [{ text: '◀️ Back', callback_data: backData }]];

  bot!.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleAddProductStep(
  chatId: number,
  userId: number,
  text: string,
  photoFileId?: string,
  photoFileIdsParam?: string[],
  autoFinalize?: boolean
): Promise<void> {
  const state = adminState.get(userId);
  if (!state || state.flow !== 'addproduct') return;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot!.sendMessage(chatId, 'Add product cancelled.');
    return;
  }

  if (state.step === 1) {
    state.data.name = text;
    state.step = 2;
    bot!.sendMessage(chatId, 'Enter product price in so\'m (number):');
  } else if (state.step === 2) {
    const price = parseFloat(text);
    if (isNaN(price)) {
      bot!.sendMessage(chatId, 'Invalid price. Enter a number:');
      return;
    }
    state.data.price = text;
    state.step = 3;
    bot!.sendMessage(chatId, 'Enter product description (or /skip):');
  } else if (state.step === 3) {
    state.data.description = text === '/skip' ? '' : text;
    state.step = 4;
    bot!.sendMessage(chatId, 'Enter how to use (or /skip):');
  } else if (state.step === 4) {
    state.data.howToUse = text === '/skip' ? '' : text;
    state.step = 5;
    bot!.sendMessage(chatId, 'Enter suitable for (who is it for, e.g. skin types) (or /skip):');
  } else if (state.step === 5) {
    state.data.suitableFor = text === '/skip' ? '' : text;
    state.step = 6;
    bot!.sendMessage(chatId, 'Enter product quantity (number of items in stock):');
  } else if (state.step === 6) {
    const quantity = parseInt(text, 10);
    if (isNaN(quantity) || quantity < 0) {
      bot!.sendMessage(chatId, 'Invalid quantity. Enter a non-negative number:');
      return;
    }
    state.data.quantity = text;
    state.step = 7;
    state.data.images = '[]';
    bot!.sendMessage(
      chatId,
      'Send product photos (1–10). Select multiple from gallery and send at once. First = main thumbnail. Add /done as caption or send /done separately when finished.',
      { parse_mode: 'Markdown' }
    );
  } else if (state.step === 7) {
    const currentImages: string[] = JSON.parse(state.data.images || '[]');
    const maxImages = 10;

    if (text === '/done') {
      if (currentImages.length < 1) {
        bot!.sendMessage(chatId, 'At least 1 image required. Send a photo or paste an image URL.');
        return;
      }
      clearAdminState(userId);
      clearUserPhotoBuffer(userId);
      const { name, price, description, howToUse, suitableFor, categoryId, quantity } = state.data;
      const stock = quantity !== undefined ? parseInt(quantity, 10) : 0;
      const desc = description || undefined;
      Product.create({
        name,
        price: parseFloat(price),
        shortDescription: desc,
        fullDescription: desc,
        description: desc,
        howToUse: howToUse || undefined,
        suitableFor: suitableFor || undefined,
        images: currentImages,
        categoryId: new mongoose.Types.ObjectId(categoryId),
        stock: isNaN(stock) ? 0 : stock,
      })
        .then((product) => {
          bot!.sendMessage(
            chatId,
            `✅ Product created!\n\nName: ${product.name}\nPrice: ${formatPrice(product.price)}\nQuantity: ${product.stock}\nImages: ${product.images.length}\nID: ${product._id}`
          );
        })
        .catch(() => {
          bot!.sendMessage(chatId, '❌ Failed to create product.');
        });
      return;
    }

    const photoFileIds = photoFileIdsParam ?? (photoFileId ? [photoFileId] : null);
    const imageValue = !photoFileIds ? text?.trim() || '' : null;

    if (photoFileIds && photoFileIds.length > 0) {
      const toAdd = Math.min(photoFileIds.length, maxImages - currentImages.length);
      if (toAdd <= 0) {
        bot!.sendMessage(chatId, `Maximum ${maxImages} images. Type /done to create.`);
        return;
      }
      const validPaths: string[] = [];
      for (let i = 0; i < toAdd; i++) {
        const processed = await processTelegramImage(photoFileIds[i]);
        if (processed) validPaths.push(processed);
      }
      if (validPaths.length === 0) {
        bot!.sendMessage(chatId, 'Could not process the images. Please try again or send image URLs instead.');
        return;
      }
      currentImages.push(...validPaths);
      state.data.images = JSON.stringify(currentImages);
      if (autoFinalize && currentImages.length >= 1) {
        clearAdminState(userId);
        clearUserPhotoBuffer(userId);
        const { name, price, description, howToUse, suitableFor, categoryId, quantity } = state.data;
        const stock = quantity !== undefined ? parseInt(quantity, 10) : 0;
        const desc = description || undefined;
        Product.create({
          name,
          price: parseFloat(price),
          shortDescription: desc,
          fullDescription: desc,
          description: desc,
          howToUse: howToUse || undefined,
          suitableFor: suitableFor || undefined,
          images: currentImages,
          categoryId: new mongoose.Types.ObjectId(categoryId),
          stock: isNaN(stock) ? 0 : stock,
        })
          .then((product) => {
            bot!.sendMessage(
              chatId,
              `✅ Product created!\n\nName: ${product.name}\nPrice: ${formatPrice(product.price)}\nQuantity: ${product.stock}\nImages: ${product.images.length}\nID: ${product._id}`
            );
          })
          .catch(() => {
            bot!.sendMessage(chatId, '❌ Failed to create product.');
          });
        return;
      }
      const added = validPaths.length;
      const failed = toAdd - added;
      const remaining = maxImages - currentImages.length;
      let msg = `📷 ${added} image(s) added. Total: ${currentImages.length}.`;
      if (failed > 0) msg += ` (${failed} failed to process)`;
      msg += remaining > 0 ? ` Send more or /done.` : ' Max reached. Type /done to create.';
      bot!.sendMessage(chatId, msg);
    } else if (imageValue) {
      if (currentImages.length >= maxImages) {
        bot!.sendMessage(chatId, `Maximum ${maxImages} images. Type /done to create.`);
        return;
      }
      currentImages.push(imageValue);
      state.data.images = JSON.stringify(currentImages);
      const remaining = maxImages - currentImages.length;
      bot!.sendMessage(
        chatId,
        `📷 Image added. Total: ${currentImages.length}. ${remaining > 0 ? `Send more or /done.` : 'Max reached. Type /done to create.'}`
      );
    } else {
      bot!.sendMessage(chatId, 'Send photo(s), image URL, or type /done (min 1 image required).');
    }
  }
}

function handleAddCategoryStep(chatId: number, userId: number, text: string): void {
  const state = adminState.get(userId);
  if (!state || state.flow !== 'addcategory') return;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot!.sendMessage(chatId, 'Add category cancelled.');
    return;
  }

  clearAdminState(userId);
  Category.create({ name: text.trim() })
    .then(() => {
      bot!.sendMessage(chatId, 'Category created successfully.');
    })
    .catch((err) => {
      if (err.code === 11000) {
        bot!.sendMessage(chatId, '❌ Category with this name already exists.');
      } else {
        bot!.sendMessage(chatId, '❌ Failed to create category.');
      }
    });
}

function handleDeleteCategoryStep(
  chatId: number,
  userId: number,
  text: string
): void {
  const state = adminState.get(userId);
  if (!state || state.flow !== 'deletecategory') return;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot!.sendMessage(chatId, 'Delete category cancelled.');
    return;
  }

  clearAdminState(userId);
  Category.findByIdAndDelete(text.trim())
    .then((category) => {
      if (category) {
        bot!.sendMessage(chatId, 'Category deleted.');
      } else {
        bot!.sendMessage(chatId, '❌ Category not found.');
      }
    })
    .catch(() => {
      bot!.sendMessage(chatId, '❌ Failed to delete category.');
    });
}

function getEditProductKeyboard(productId: string) {
  return {
    inline_keyboard: [
      [{ text: 'Edit Name', callback_data: `edit_name_${productId}` }],
      [{ text: 'Edit Price', callback_data: `edit_price_${productId}` }],
      [{ text: 'Edit Description', callback_data: `edit_desc_${productId}` }],
      [{ text: 'Edit How to Use', callback_data: `edit_howtouse_${productId}` }],
      [{ text: 'Edit Suitable For', callback_data: `edit_suitablefor_${productId}` }],
      [{ text: 'Edit Image', callback_data: `edit_image_${productId}` }],
      [{ text: 'Edit Quantity', callback_data: `edit_quantity_${productId}` }],
      [{ text: 'Change Category', callback_data: `edit_cat_${productId}` }],
    ],
  };
}

async function handleEditProductStep(
  chatId: number,
  userId: number,
  text: string,
  photoFileId?: string,
  photoFileIdsParam?: string[],
  autoFinalize?: boolean
): Promise<void> {
  const state = adminState.get(userId);
  if (!state || state.flow !== 'editproduct') return;

  const productId = state.data.productId;
  const step = state.step as EditProductStep;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot!.sendMessage(chatId, 'Edit cancelled.');
    return;
  }

  const updateAndReply = (update: Record<string, unknown>) => {
    Product.findByIdAndUpdate(productId, update, { new: true })
      .then(() => {
        clearAdminState(userId);
        bot!.sendMessage(chatId, 'Product updated successfully.');
      })
      .catch(() => {
        bot!.sendMessage(chatId, '❌ Failed to update product.');
      });
  };

  if (step === 'name') {
    updateAndReply({ name: text });
  } else if (step === 'quantity') {
    const quantity = parseInt(text, 10);
    if (isNaN(quantity) || quantity < 0) {
      bot!.sendMessage(chatId, 'Invalid quantity. Enter a non-negative number:');
      return;
    }
    updateAndReply({ stock: quantity });
  } else if (step === 'price') {
    const price = parseFloat(text);
    if (isNaN(price)) {
      bot!.sendMessage(chatId, 'Invalid price. Enter a number:');
      return;
    }
    updateAndReply({ price });
  } else if (step === 'description') {
    const val = text === '/skip' ? '' : text;
    updateAndReply({ shortDescription: val, fullDescription: val, description: val });
  } else if (step === 'howToUse') {
    updateAndReply({ howToUse: text === '/skip' ? '' : text });
  } else if (step === 'suitableFor') {
    updateAndReply({ suitableFor: text === '/skip' ? '' : text });
  } else if (step === 'image') {
    const currentImages: string[] = JSON.parse(state.data.images || '[]');
    const maxImages = 10;

    if (text === '/done') {
      if (currentImages.length < 1) {
        bot!.sendMessage(chatId, 'At least 1 image required. Send a photo or paste an image URL.');
        return;
      }
      Product.findByIdAndUpdate(productId, { images: currentImages })
        .then(() => {
          clearAdminState(userId);
          bot!.sendMessage(chatId, `Product images updated. ${currentImages.length} image(s) saved.`);
        })
        .catch(() => {
          bot!.sendMessage(chatId, '❌ Failed to update product.');
        });
      return;
    }

    const photoFileIds = photoFileIdsParam ?? (photoFileId ? [photoFileId] : null);
    const imageValue = !photoFileIds ? text?.trim() || '' : null;

    if (photoFileIds && photoFileIds.length > 0) {
      const toAdd = Math.min(photoFileIds.length, maxImages - currentImages.length);
      if (toAdd <= 0) {
        bot!.sendMessage(chatId, `Maximum ${maxImages} images. Type /done to save.`);
        return;
      }
      const validPaths: string[] = [];
      for (let i = 0; i < toAdd; i++) {
        const processed = await processTelegramImage(photoFileIds[i]);
        if (processed) validPaths.push(processed);
      }
      if (validPaths.length === 0) {
        bot!.sendMessage(chatId, 'Could not process the images. Please try again or send image URLs instead.');
        return;
      }
      currentImages.push(...validPaths);
      state.data.images = JSON.stringify(currentImages);
      if (autoFinalize && currentImages.length >= 1) {
        Product.findByIdAndUpdate(productId, { images: currentImages })
          .then(() => {
            clearAdminState(userId);
            bot!.sendMessage(chatId, `Product images updated. ${currentImages.length} image(s) saved.`);
          })
          .catch(() => {
            bot!.sendMessage(chatId, '❌ Failed to update product.');
          });
        return;
      }
      const added = validPaths.length;
      const failed = toAdd - added;
      const remaining = maxImages - currentImages.length;
      let msg = `📷 ${added} image(s) added. Total: ${currentImages.length}.`;
      if (failed > 0) msg += ` (${failed} failed to process)`;
      msg += remaining > 0 ? ` Send more or /done.` : ' Max reached. Type /done to save.';
      bot!.sendMessage(chatId, msg);
    } else if (imageValue) {
      if (currentImages.length >= maxImages) {
        bot!.sendMessage(chatId, `Maximum ${maxImages} images. Type /done to save.`);
        return;
      }
      currentImages.push(imageValue);
      state.data.images = JSON.stringify(currentImages);
      const remaining = maxImages - currentImages.length;
      bot!.sendMessage(
        chatId,
        `📷 Image added. Total: ${currentImages.length}. ${remaining > 0 ? `Send more or /done.` : 'Max reached. Type /done to save.'}`
      );
    } else {
      bot!.sendMessage(chatId, 'Send photo(s), image URL, or type /done (min 1 image required).');
    }
  }
}

function handleDeleteProductStep(chatId: number, userId: number, text: string): void {
  const state = adminState.get(userId);
  if (!state || state.flow !== 'deleteproduct') return;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot!.sendMessage(chatId, 'Delete product cancelled.');
    return;
  }

  clearAdminState(userId);
  Product.findByIdAndDelete(text.trim())
    .then((product) => {
      if (product) {
        bot!.sendMessage(chatId, `✅ Product "${product.name}" deleted.`);
      } else {
        bot!.sendMessage(chatId, '❌ Product not found.');
      }
    })
    .catch(() => {
      bot!.sendMessage(chatId, '❌ Failed to delete product.');
    });
}

interface BotMessage {
  from?: { id?: number };
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
  media_group_id?: string;
}

function clearUserPhotoBuffer(userId: number): void {
  const buffered = userPhotoBuffer.get(userId);
  if (buffered) {
    clearTimeout(buffered.timeout);
    userPhotoBuffer.delete(userId);
  }
}

function flushUserPhotoBuffer(userId: number): void {
  const buffered = userPhotoBuffer.get(userId);
  if (!buffered) return;
  userPhotoBuffer.delete(userId);
  clearTimeout(buffered.timeout);
  const { fileIds, chatId, flow, captionDone } = buffered;
  if (flow === 'addproduct') {
    void handleAddProductStep(chatId, userId, captionDone ? '/done' : '', undefined, fileIds, captionDone);
  } else {
    void handleEditProductStep(chatId, userId, captionDone ? '/done' : '', undefined, fileIds, captionDone);
  }
}

function handlePhotoUpload(
  chatId: number,
  userId: number,
  fileId: string,
  flow: 'addproduct' | 'editproduct',
  _mediaGroupId?: string,
  captionDone?: boolean
): void {
  const existing = userPhotoBuffer.get(userId);
  if (existing) {
    existing.fileIds.push(fileId);
    if (captionDone) existing.captionDone = true;
    clearTimeout(existing.timeout);
    existing.timeout = setTimeout(() => flushUserPhotoBuffer(userId), PHOTO_BATCH_DELAY_MS);
    return;
  }
  const fileIds = [fileId];
  const timeout = setTimeout(() => flushUserPhotoBuffer(userId), PHOTO_BATCH_DELAY_MS);
  userPhotoBuffer.set(userId, { fileIds, chatId, flow, timeout, captionDone });
}

function handleConversationMessage(msg: BotMessage): void {
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!userId) return;

  const state = adminState.get(userId);

  // Handle editproduct image step with photo upload
  if (state?.flow === 'editproduct' && state.step === 'image' && msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    const captionDone = msg.caption?.trim() === '/done';
    handlePhotoUpload(chatId, userId, photo.file_id, 'editproduct', msg.media_group_id, captionDone);
    return;
  }

  // Handle addproduct step 5 (image) with photo upload
  if (state?.flow === 'addproduct' && state.step === 7 && msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    const captionDone = msg.caption?.trim() === '/done';
    handlePhotoUpload(chatId, userId, photo.file_id, 'addproduct', msg.media_group_id, captionDone);
    return;
  }

  if (!text || (text.startsWith('/') && text !== '/cancel' && text !== '/skip' && text !== '/done')) return;
  if (!state) return;

  if (state.flow === 'addproduct') {
    handleAddProductStep(chatId, userId, text);
  } else if (state.flow === 'deleteproduct') {
    handleDeleteProductStep(chatId, userId, text);
  } else if (state.flow === 'addcategory') {
    handleAddCategoryStep(chatId, userId, text);
  } else if (state.flow === 'deletecategory') {
    handleDeleteCategoryStep(chatId, userId, text);
  } else if (state.flow === 'editproduct') {
    handleEditProductStep(chatId, userId, text);
  }
}

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const miniappUrl = process.env.MINIAPP_URL ?? 'https://example.com';

  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot will not start.');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  await setupBotCommands(bot);

  // Telegram API requires menu_button as JSON string (see node-telegram-bot-api#995, #1165)
  const openShopMenuButton = JSON.stringify({
    type: 'web_app',
    text: '🛍 Open Shop',
    web_app: { url: miniappUrl },
  }) as unknown as TelegramBot.MenuButton;
  const commandsMenuButton = JSON.stringify({ type: 'commands' }) as unknown as TelegramBot.MenuButton;

  // Default menu button: Open Shop for all clients
  try {
    await bot.setChatMenuButton({ menu_button: openShopMenuButton });
  } catch (err) {
    console.warn('Could not set default chat menu button:', err);
  }

  async function setMenuButtonForUser(chatId: number, isAdminUser: boolean) {
    try {
      await bot!.setChatMenuButton({
        chat_id: chatId,
        menu_button: isAdminUser ? commandsMenuButton : openShopMenuButton,
      });
    } catch (err) {
      console.warn('Could not set menu button for user:', err);
    }
  }

  const sendWelcomeWithKeyboard = (chatId: number, userId: number) => {
    const isAdminUser = isAdmin(userId);
    void setMenuButtonForUser(chatId, isAdminUser);
    if (isAdminUser) {
      bot!.sendMessage(chatId, 'Welcome to Nur Cosmetics!', {
        reply_markup: getAdminReplyKeyboard(miniappUrl),
      });
    } else {
      bot!.sendMessage(chatId, 'Welcome to Nur Cosmetics! Tap the menu button or "🛍 Open Shop" to browse and buy.', {
        reply_markup: getBuyerKeyboard(miniappUrl),
      });
    }
  };

  const sendCategoriesForShop = (chatId: number, userId: number) => {
    void sendCategoriesForBrowse(chatId, userId, isAdmin(userId));
  };

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? 0;
    sendWelcomeWithKeyboard(chatId, userId);
  });

  bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? 0;
    sendWelcomeWithKeyboard(chatId, userId);
  });

  bot.onText(/\/shop/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? 0;
    void setMenuButtonForUser(chatId, isAdmin(userId));
    sendCategoriesForShop(chatId, userId);
  });

  bot.onText(/\/orders/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? 0;
    if (isAdmin(userId)) {
      Order.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .then((orders) => {
          if (orders.length === 0) {
            bot!.sendMessage(chatId, 'No orders found.');
            return;
          }
          const text = orders
            .map(
              (o) =>
                `*Order #${o.orderNumber ?? o._id}*\n` +
                `Phone: ${o.phoneNumber ?? o.phone ?? 'N/A'}\n` +
                `Total: ${formatPrice(o.totalPrice)}\n` +
                `Status: ${o.status}\n` +
                `Items: ${o.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}`
            )
            .join('\n\n');
          bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        });
    } else {
      bot!.sendMessage(chatId, 'Open the shop and tap the 📦 icon to view your order history.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🛍 Open Shop', web_app: { url: miniappUrl } }]],
        },
      });
    }
  });

  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? 0;
    void setMenuButtonForUser(chatId, isAdmin(userId));
    bot!.sendMessage(
      chatId,
      '*Nur Cosmetics Bot*\n\n• Use the menu buttons to navigate\n• Open Shop to browse and buy cosmetics\n• Contact support for any questions',
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/admin/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }
    handleAdminMenu(chatId, miniappUrl);
  });

  bot.onText(/\/addproduct/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }

    Category.find()
      .sort({ name: 1 })
      .then((categories) => {
        if (categories.length === 0) {
          bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
          return;
        }
        adminState.set(userId, {
          flow: 'addproduct',
          step: 0,
          data: {},
        });
        bot!.sendMessage(chatId, 'Select category:', {
          reply_markup: {
            inline_keyboard: categories.map((c) => [
              { text: c.name, callback_data: `addproduct_cat_${c._id}` },
            ]),
          },
        });
      })
      .catch(() => {
        bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
      });
  });

  bot.onText(/\/products/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }
    void sendCategoriesForBrowse(chatId, userId, true);
  });

  bot.onText(/\/addcategory/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }

    adminState.set(userId, {
      flow: 'addcategory',
      step: 0,
      data: {},
    });
    bot!.sendMessage(chatId, 'Enter category name:\n_(Send /cancel to abort)_', {
      parse_mode: 'Markdown',
    });
  });

  bot.onText(/\/categories/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }

    Category.find()
      .sort({ name: 1 })
      .then((categories) => {
        if (categories.length === 0) {
          bot!.sendMessage(chatId, 'No categories found.');
          return;
        }
        const text =
          '*Categories:*\n\n' +
          categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
        bot!.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: categories.map((c) => [
              { text: `🗑 Delete ${c.name}`, callback_data: `delcat_${c._id}` },
            ]),
          },
        });
      })
      .catch(() => bot!.sendMessage(chatId, '❌ Failed to fetch categories.'));
  });

  bot.onText(/\/deletecategory/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }

    adminState.set(userId, {
      flow: 'deletecategory',
      step: 0,
      data: {},
    });
    bot!.sendMessage(chatId, 'Enter category ID to delete:\n_(Send /cancel to abort)_', {
      parse_mode: 'Markdown',
    });
  });

  bot.onText(/\/deleteproduct/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }

    adminState.set(userId, {
      flow: 'deleteproduct',
      step: 0,
      data: {},
    });
    bot!.sendMessage(chatId, 'Enter product ID to delete:\n_(Send /cancel to abort)_', {
      parse_mode: 'Markdown',
    });
  });

  bot.onText(/\/reviews/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    if (!userId) return;

    if (!isAdmin(userId)) {
      sendAccessDenied(chatId);
      return;
    }
    void sendReviewCategories(chatId, userId);
  });

  bot.on('message', (msg: BotMessage) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!userId) return;

    // Ensure correct menu button for every user on any interaction
    void setMenuButtonForUser(chatId, isAdmin(userId));

    // Handle reply keyboard button presses
    // Note: "🛍 Open Shop" with web_app opens the Mini App directly and doesn't send this message
    if (text === '🛍 Open Shop') {
      bot!.sendMessage(chatId, 'Tap below to open the shop:', {
        reply_markup: {
          inline_keyboard: [[{ text: '🛍 Open Shop', web_app: { url: miniappUrl } }]],
        },
      });
      return;
    }
    if (text === 'ℹ️ Help') {
      bot!.sendMessage(
        chatId,
        '*Nur Cosmetics Bot*\n\n• Use the menu buttons to navigate\n• Open Shop to browse and buy cosmetics\n• Contact support for any questions',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    if (text === '➕ Add Product' && isAdmin(userId)) {
      Category.find()
        .sort({ name: 1 })
        .then((categories) => {
          if (categories.length === 0) {
            bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
            return;
          }
          adminState.set(userId, { flow: 'addproduct', step: 0, data: {} });
          bot!.sendMessage(chatId, 'Select category:', {
            reply_markup: { inline_keyboard: categories.map((c) => [{ text: c.name, callback_data: `addproduct_cat_${c._id}` }]) },
          });
        });
      return;
    }
    if (text === '📦 Products' && isAdmin(userId)) {
      void sendCategoriesForBrowse(chatId, userId, true);
      return;
    }
    if (text === '📂 Categories' && isAdmin(userId)) {
      Category.find()
        .sort({ name: 1 })
        .then((categories) => {
          if (categories.length === 0) {
            bot!.sendMessage(chatId, 'No categories found.');
            return;
          }
          const txt = '*Categories:*\n\n' + categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
          bot!.sendMessage(chatId, txt, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: categories.map((c) => [{ text: '🗑 Delete', callback_data: `delcat_${c._id}` }]) },
          });
        });
      return;
    }
    if (text === '⭐ Reviews' && isAdmin(userId)) {
      void sendReviewCategories(chatId, userId);
      return;
    }
    if (text === '🧾 Orders' && isAdmin(userId)) {
      Order.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .then((orders) => {
          if (orders.length === 0) {
            bot!.sendMessage(chatId, 'No orders found.');
            return;
          }
          const txt = orders
            .map(
              (o) =>
                `*Order #${o.orderNumber ?? o._id}*\n` +
                `Phone: ${o.phoneNumber ?? o.phone ?? 'N/A'}\n` +
                `Total: ${formatPrice(o.totalPrice)}\n` +
                `Status: ${o.status}\n` +
                `Items: ${o.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}`
            )
            .join('\n\n');
          bot!.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
        });
      return;
    }

    if (!isAdmin(userId)) return;
    handleConversationMessage(msg);
  });

  bot.on('callback_query', async (query: { from?: { id?: number }; message?: { chat?: { id: number } }; data?: string; id: string }) => {
    const userId = query.from?.id;
    const chatId = query.message?.chat?.id ?? 0;
    const data = query.data;

    if (!userId || !chatId || !data) return;

    // Browse callbacks - allowed for both admin and buyer
    if (data.startsWith('category_')) {
      bot!.answerCallbackQuery(query.id);
      const categoryId = data.replace('category_', '');
      await sendProductsPage(chatId, userId, categoryId, 0, isAdmin(userId));
      return;
    }
    if (data.startsWith('more_')) {
      bot!.answerCallbackQuery(query.id);
      const rest = data.replace('more_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const categoryId = rest.substring(0, lastUnderscore);
      const page = parseInt(rest.substring(lastUnderscore + 1), 10);
      await sendProductsPageMore(chatId, userId, categoryId, page, isAdmin(userId));
      return;
    }
    if (data === 'back_categories') {
      bot!.answerCallbackQuery(query.id);
      await sendCategoriesForBrowse(chatId, userId, isAdmin(userId));
      return;
    }

    if (data.startsWith('mark_delivered_') && isAdmin(userId)) {
      const orderId = data.replace('mark_delivered_', '');
      bot!.answerCallbackQuery(query.id);
      Order.findByIdAndUpdate(orderId, { confirmedByAdmin: true, status: 'delivered' }, { new: true })
        .then((order) => {
          if (order && query.message) {
            const msg = query.message as { message_id: number };
            const newText =
              (query.message as { text?: string }).text?.replace('Status: pending', 'Status: delivered') ??
              `Order #${order.orderNumber}\n\nPhone: ${order.phoneNumber ?? 'N/A'}\nTotal: ${formatPrice(order.totalPrice)}\nStatus: delivered\nItems: ${order.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}`;
            bot!.editMessageText(newText, {
              chat_id: chatId,
              message_id: msg.message_id,
              reply_markup: { inline_keyboard: [] },
            }).catch(() => {});
            bot!.sendMessage(chatId, '✓ Order marked as delivered. Customer can now leave reviews.');
          } else {
            bot!.sendMessage(chatId, 'Order not found.');
          }
        })
        .catch(() => bot!.sendMessage(chatId, 'Failed to update order.'));
      return;
    }

    if (data.startsWith('confirm_order_') && isAdmin(userId)) {
      const orderId = data.replace('confirm_order_', '');
      bot!.answerCallbackQuery(query.id);
      Order.findByIdAndUpdate(orderId, { confirmedByAdmin: true, status: 'delivered' }, { new: true })
        .then((order) => {
          if (order) {
            bot!.sendMessage(chatId, 'Order confirmed. Customer can now leave reviews.');
          } else {
            bot!.sendMessage(chatId, 'Order not found.');
          }
        })
        .catch(() => bot!.sendMessage(chatId, 'Failed to confirm order.'));
      return;
    }
    if (data.startsWith('reject_order_') && isAdmin(userId)) {
      bot!.answerCallbackQuery(query.id);
      bot!.sendMessage(chatId, 'Order confirmation rejected.');
      return;
    }

    if (!isAdmin(userId)) {
      bot!.answerCallbackQuery(query.id);
      bot!.sendMessage(chatId, 'Access denied. Admin only.');
      return;
    }

    if (data === 'admin_addproduct') {
      bot!.answerCallbackQuery(query.id);
      Category.find()
        .sort({ name: 1 })
        .then((categories) => {
          if (categories.length === 0) {
            bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
            return;
          }
          adminState.set(userId, {
            flow: 'addproduct',
            step: 0,
            data: {},
          });
          bot!.sendMessage(chatId, 'Select category:', {
            reply_markup: {
              inline_keyboard: categories.map((c) => [
                { text: c.name, callback_data: `addproduct_cat_${c._id}` },
              ]),
            },
          });
        })
        .catch(() => {
          bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
        });
    } else if (data.startsWith('addproduct_cat_')) {
      const categoryId = data.replace('addproduct_cat_', '');
      bot!.answerCallbackQuery(query.id);
      const state = adminState.get(userId);
      if (state && state.flow === 'addproduct') {
        state.data.categoryId = categoryId;
        state.step = 1;
        bot!.sendMessage(chatId, 'Enter product name:\n_(Send /cancel to abort)_', {
          parse_mode: 'Markdown',
        });
      }
    } else if (data === 'admin_categories') {
      bot!.answerCallbackQuery(query.id);
      Category.find()
        .sort({ name: 1 })
        .then((categories) => {
          if (categories.length === 0) {
            bot!.sendMessage(chatId, 'No categories found.');
            return;
          }
          const text =
            '*Categories:*\n\n' +
            categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
          bot!.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: categories.map((c) => [
                { text: `🗑 Delete`, callback_data: `delcat_${c._id}` },
              ]),
            },
          });
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to fetch categories.'));
    } else if (data.startsWith('delcat_')) {
      const categoryId = data.replace('delcat_', '');
      bot!.answerCallbackQuery(query.id);
      Category.findByIdAndDelete(categoryId)
        .then((category) => {
          if (category) {
            bot!.sendMessage(chatId, 'Category deleted.');
          } else {
            bot!.sendMessage(chatId, '❌ Category not found.');
          }
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to delete category.'));
    } else if (data === 'admin_products') {
      bot!.answerCallbackQuery(query.id);
      await sendCategoriesForBrowse(chatId, userId, true);
    } else if (data === 'admin_orders') {
      bot!.answerCallbackQuery(query.id);
      Order.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .then((orders) => {
          if (orders.length === 0) {
            bot!.sendMessage(chatId, 'No orders found.');
            return;
          }
          const text = orders
            .map(
              (o) =>
                `*Order #${o.orderNumber ?? o._id}*\n` +
                `Phone: ${o.phoneNumber ?? o.phone ?? 'N/A'}\n` +
                `Total: ${formatPrice(o.totalPrice)}\n` +
                `Status: ${o.status}\n` +
                `Items: ${o.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}\n` +
                `Created: ${new Date(o.createdAt).toLocaleString()}`
            )
            .join('\n\n');
          bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to fetch orders.'));
    } else if (data.startsWith('confirm_delete_review_')) {
      const reviewId = data.replace('confirm_delete_review_', '');
      bot!.answerCallbackQuery(query.id);
      const state = reviewModerationState.get(userId);
      const productId = state?.productId;
      Review.findByIdAndDelete(reviewId)
        .then(async (deleted) => {
          if (deleted) {
            bot!.sendMessage(chatId, 'Review deleted successfully.');
            if (productId) {
              await sendReviewForProduct(chatId, userId, productId, state?.page ?? 0, state?.reviewIndex ?? 0);
            } else {
              bot!.sendMessage(chatId, 'No more reviews to show.');
            }
          } else {
            bot!.sendMessage(chatId, '❌ Review not found.');
          }
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to delete review.'));
    } else if (data === 'cancel_delete_review') {
      bot!.answerCallbackQuery(query.id);
      bot!.sendMessage(chatId, 'Delete cancelled.');
    } else if (data.startsWith('delete_') && !data.startsWith('delete_cat_') && !data.startsWith('delete_review_')) {
      const productId = data.replace('delete_', '');
      bot!.answerCallbackQuery(query.id);
      Product.findById(productId).then((product) => {
        if (product) {
          bot!.sendMessage(chatId, `Are you sure you want to delete "${product.name}"?`, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Yes Delete', callback_data: `confirm_delete_${productId}` },
                  { text: 'Cancel', callback_data: `cancel_delete_${productId}` },
                ],
              ],
            },
          });
        } else {
          bot!.sendMessage(chatId, '❌ Product not found.');
        }
      });
    } else if (data.startsWith('confirm_delete_') && !data.startsWith('confirm_delete_review_')) {
      const productId = data.replace('confirm_delete_', '');
      bot!.answerCallbackQuery(query.id);
      Product.findByIdAndDelete(productId)
        .then((product) => {
          if (product) {
            bot!.sendMessage(chatId, `✅ Product "${product.name}" deleted.`);
          } else {
            bot!.sendMessage(chatId, '❌ Product not found.');
          }
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to delete product.'));
    } else if (data.startsWith('cancel_delete_') && data !== 'cancel_delete_review') {
      bot!.answerCallbackQuery(query.id);
      bot!.sendMessage(chatId, 'Delete cancelled.');
    } else if (data.startsWith('edit_') && !data.startsWith('edit_name_') && !data.startsWith('edit_price_') && !data.startsWith('edit_desc_') && !data.startsWith('edit_howtouse_') && !data.startsWith('edit_suitablefor_') && !data.startsWith('edit_image_') && !data.startsWith('edit_cat_') && !data.startsWith('edit_quantity_') && !data.startsWith('editproduct_cat_')) {
      const productId = data.replace('edit_', '');
      bot!.answerCallbackQuery(query.id);
      Product.findById(productId).then((product) => {
        if (product) {
          bot!.sendMessage(chatId, `*Edit Product: ${product.name}*`, {
            parse_mode: 'Markdown',
            reply_markup: getEditProductKeyboard(productId),
          });
        } else {
          bot!.sendMessage(chatId, '❌ Product not found.');
        }
      });
    } else if (data.startsWith('edit_name_')) {
      const productId = data.replace('edit_name_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'name',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new product name:\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_price_')) {
      const productId = data.replace('edit_price_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'price',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new price in so\'m (number):\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_desc_')) {
      const productId = data.replace('edit_desc_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'description',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new description (or /skip):\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_howtouse_')) {
      const productId = data.replace('edit_howtouse_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'howToUse',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new how to use (or /skip):\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_suitablefor_')) {
      const productId = data.replace('edit_suitablefor_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'suitableFor',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new suitable for (or /skip):\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_image_')) {
      const productId = data.replace('edit_image_', '');
      bot!.answerCallbackQuery(query.id);
      Product.findById(productId)
        .lean()
        .then((product) => {
          const existingImages = (product?.images as string[] | undefined) ?? [];
          adminState.set(userId, {
            flow: 'editproduct',
            step: 'image',
            data: { productId, images: JSON.stringify(existingImages) },
          });
          const count = existingImages.length;
          bot!.sendMessage(
            chatId,
            `Edit images (1–10). Current: ${count}. You can select multiple from gallery. Send photos/URLs or /done to save. First = main thumbnail.`,
            { parse_mode: 'Markdown' }
          );
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to load product.'));
    } else if (data.startsWith('edit_quantity_')) {
      const productId = data.replace('edit_quantity_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'quantity',
        data: { productId },
      });
      bot!.sendMessage(chatId, 'Enter new quantity (number of items in stock):\n_(Send /cancel to abort)_', {
        parse_mode: 'Markdown',
      });
    } else if (data.startsWith('edit_cat_')) {
      const productId = data.replace('edit_cat_', '');
      bot!.answerCallbackQuery(query.id);
      adminState.set(userId, {
        flow: 'editproduct',
        step: 'category',
        data: { productId },
      });
      Category.find()
        .sort({ name: 1 })
        .then((categories) => {
          if (categories.length === 0) {
            bot!.sendMessage(chatId, 'No categories found. Use /addcategory first.');
            clearAdminState(userId);
            return;
          }
          bot!.sendMessage(chatId, 'Select new category:', {
            reply_markup: {
              inline_keyboard: categories.map((c) => [
                { text: c.name, callback_data: `epcat_${c._id}` },
              ]),
            },
          });
        })
        .catch(() => {
          bot!.sendMessage(chatId, '❌ Failed to fetch categories.');
          clearAdminState(userId);
        });
    } else if (data.startsWith('epcat_')) {
      const categoryId = data.replace('epcat_', '');
      bot!.answerCallbackQuery(query.id);
      const state = adminState.get(userId);
      const productId = state?.flow === 'editproduct' ? state.data.productId : null;
      if (!productId) {
        bot!.sendMessage(chatId, 'Session expired. Please try again.');
        return;
      }
      Product.findByIdAndUpdate(productId, {
        categoryId: new mongoose.Types.ObjectId(categoryId),
      })
        .then(() => {
          clearAdminState(userId);
          bot!.sendMessage(chatId, 'Product updated successfully.');
        })
        .catch(() => bot!.sendMessage(chatId, '❌ Failed to update product.'));
    } else if (data === 'admin_reviews') {
      bot!.answerCallbackQuery(query.id);
      void sendReviewCategories(chatId, userId);
    } else if (data.startsWith('review_category_')) {
      const categoryId = data.replace('review_category_', '');
      bot!.answerCallbackQuery(query.id);
      await sendReviewProducts(chatId, userId, categoryId);
    } else if (data.startsWith('review_product_')) {
      const productId = data.replace('review_product_', '');
      bot!.answerCallbackQuery(query.id);
      await sendReviewForProduct(chatId, userId, productId, 0, 0);
    } else if (data.startsWith('review_back_products_')) {
      const categoryId = data.replace('review_back_products_', '');
      bot!.answerCallbackQuery(query.id);
      await sendReviewProducts(chatId, userId, categoryId);
    } else if (data === 'review_back_category') {
      bot!.answerCallbackQuery(query.id);
      void sendReviewCategories(chatId, userId);
    } else if (data.startsWith('next_review_')) {
      const rest = data.replace('next_review_', '');
      const parts = rest.split('_');
      const productId = parts[0];
      const page = parseInt(parts[1] ?? '0', 10);
      const reviewIndex = parseInt(parts[2] ?? '0', 10);
      bot!.answerCallbackQuery(query.id);
      const nextIndex = reviewIndex + 1;
      const nextPage = nextIndex >= REVIEWS_PER_PAGE ? page + 1 : page;
      const nextIndexInPage = nextIndex >= REVIEWS_PER_PAGE ? 0 : nextIndex;
      await sendReviewForProduct(chatId, userId, productId!, nextPage, nextIndexInPage);
    } else if (data.startsWith('delete_review_')) {
      const reviewId = data.replace('delete_review_', '');
      bot!.answerCallbackQuery(query.id);
      bot!.sendMessage(chatId, 'Are you sure you want to delete this review?', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Yes Delete', callback_data: `confirm_delete_review_${reviewId}` },
              { text: 'Cancel', callback_data: 'cancel_delete_review' },
            ],
          ],
        },
      });
    }
  });

  console.log('Telegram bot started');
}

export function getBot(): TelegramBot | null {
  return bot;
}
