"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileVideo, FileImage, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadedFile {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export function FileUpload({ onFilesUploaded, maxFiles = 5, disabled }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Erreur upload");
      return null;
    }
    return res.json();
  };

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const toUpload = Array.from(fileList).slice(0, maxFiles - files.length);
      if (toUpload.length === 0) return;

      setUploading(true);
      const uploaded: UploadedFile[] = [];

      for (const file of toUpload) {
        const result = await uploadFile(file);
        if (result) uploaded.push(result);
      }

      const newFiles = [...files, ...uploaded];
      setFiles(newFiles);
      onFilesUploaded(newFiles);
      setUploading(false);
    },
    [files, maxFiles, onFilesUploaded]
  );

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesUploaded(newFiles);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Upload en cours...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <Upload className="h-5 w-5" />
            <span className="text-sm">
              Glissez des fichiers ou cliquez pour parcourir
            </span>
            <span className="text-xs text-gray-400">
              Images (JPEG, PNG, WebP) ou vidéos (MP4, MOV) — max 50 MB
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5 text-sm"
            >
              {file.mimeType.startsWith("image/") ? (
                <FileImage className="h-4 w-4 text-blue-500" />
              ) : (
                <FileVideo className="h-4 w-4 text-purple-500" />
              )}
              <span className="max-w-[150px] truncate">{file.filename}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
