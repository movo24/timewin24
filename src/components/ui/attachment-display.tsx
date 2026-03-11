"use client";

import { useState } from "react";
import { Download, FileVideo, X } from "lucide-react";

interface Attachment {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

interface AttachmentDisplayProps {
  attachments: Attachment[];
}

export function AttachmentDisplay({ attachments }: AttachmentDisplayProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {attachments.map((att) => {
          const url = `/api/uploads/${att.path}`;
          const isImage = att.mimeType.startsWith("image/");
          const isVideo = att.mimeType.startsWith("video/");

          if (isImage) {
            return (
              <button
                key={att.id}
                onClick={() => setLightbox(url)}
                className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
              >
                <img
                  src={url}
                  alt={att.filename}
                  className="h-20 w-20 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            );
          }

          if (isVideo) {
            return (
              <div key={att.id} className="rounded-lg border border-gray-200 overflow-hidden">
                <video
                  src={url}
                  controls
                  preload="metadata"
                  className="h-32 max-w-[240px]"
                />
                <div className="px-2 py-1 text-xs text-gray-500 flex items-center gap-1">
                  <FileVideo className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{att.filename}</span>
                  <span>({formatSize(att.size)})</span>
                </div>
              </div>
            );
          }

          // Fallback: download link
          return (
            <a
              key={att.id}
              href={url}
              download={att.filename}
              className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 text-sm hover:bg-gray-200 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{att.filename}</span>
              <span className="text-gray-400">({formatSize(att.size)})</span>
            </a>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
