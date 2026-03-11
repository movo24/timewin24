import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveFile(
  file: File
): Promise<{ filename: string; storedPath: string; mimeType: string; size: number }> {
  await ensureUploadDir();

  const ext = path.extname(file.name) || mimeToExt(file.type);
  const uniqueName = `${randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, uniqueName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return {
    filename: file.name,
    storedPath: uniqueName, // relative to UPLOAD_DIR
    mimeType: file.type,
    size: buffer.length,
  };
}

export async function deleteFile(storedPath: string) {
  const filePath = path.join(UPLOAD_DIR, storedPath);
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be deleted
  }
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "application/pdf": ".pdf",
  };
  return map[mimeType] || "";
}
