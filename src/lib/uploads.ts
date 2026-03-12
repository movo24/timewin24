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

// Magic bytes signatures for file type validation
const MAGIC_BYTES: { mime: string; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  { mime: "video/mp4", bytes: [] }, // ftyp at offset 4 — checked separately
  { mime: "video/quicktime", bytes: [] }, // also ftyp
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

function detectMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 8) return null;

  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "image/jpeg";
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "image/png";
  // WebP (RIFF....WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  // PDF (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  // MP4/MOV (ftyp at offset 4)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "video/mp4";

  return null;
}

export async function saveFile(
  file: File
): Promise<{ filename: string; storedPath: string; mimeType: string; size: number }> {
  await ensureUploadDir();

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate magic bytes match the claimed MIME type
  const detectedMime = detectMimeFromBytes(buffer);
  const trustedMime = detectedMime && ALLOWED_TYPES.includes(detectedMime) ? detectedMime : file.type;

  if (detectedMime && detectedMime !== file.type && file.type !== "video/quicktime") {
    // Allow video/quicktime ↔ video/mp4 mismatch (same ftyp header)
    if (!(detectedMime === "video/mp4" && file.type === "video/quicktime")) {
      throw new Error("Le type de fichier ne correspond pas à son contenu");
    }
  }

  const ext = mimeToExt(trustedMime) || path.extname(file.name) || '.bin';
  const uniqueName = `${randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, uniqueName);

  await fs.writeFile(filePath, buffer);

  return {
    filename: file.name,
    storedPath: uniqueName, // relative to UPLOAD_DIR
    mimeType: trustedMime,
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
