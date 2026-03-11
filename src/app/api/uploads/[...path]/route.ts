import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/api-helpers";
import { UPLOAD_DIR } from "@/lib/uploads";
import fs from "fs/promises";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { error } = await requireAuthenticated();
  if (error) return error;

  const { path: segments } = await params;
  const filePath = path.join(UPLOAD_DIR, ...segments);

  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = extToMime(ext);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext] || "application/octet-stream";
}
