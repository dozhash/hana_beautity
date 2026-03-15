import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

/**
 * Downloads image from Telegram, resizes, compresses, and saves locally.
 * Returns the URL path on success, or null on failure (fallback to file_id).
 */
export async function processTelegramImage(
  fileId: string
): Promise<string | null> {
  if (!TOKEN) return null;

  try {
    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Get file path from Telegram
    const getFileRes = await axios.get<{ result: { file_path: string } }>(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
    );
    const filePath = getFileRes.data?.result?.file_path;
    if (!filePath) return null;

    // Download image
    const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    const imageRes = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(imageRes.data);

    // Resize and compress (unique filename for rapid multi-upload)
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const filename = `product_${unique}.jpg`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    await sharp(buffer)
      .resize({ width: 800, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    const urlPath = `/uploads/products/${filename}`;
    console.log(`Product image processed and saved: ${filename}`);
    return urlPath;
  } catch {
    return null;
  }
}
