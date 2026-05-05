export type FileValidation = {
  maxSizeBytes: number;
  mimeTypes: string[];
  extensions: string[];
};

export type StoredFile = {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
};

export interface StorageDriver {
  put(file: Buffer, meta: StoredFile): Promise<StoredFile>;
  delete(path: string): Promise<void>;
}

export const defaultFileValidation: FileValidation = {
  maxSizeBytes: 10 * 1024 * 1024,
  mimeTypes: ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"],
  extensions: [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".txt"]
};
