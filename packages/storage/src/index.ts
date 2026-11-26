import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
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

/** Local private storage; only opaque generated keys are accepted. */
export class LocalStorage implements StorageDriver {
  constructor(private readonly root = resolve(process.env.UPLOADS_ROOT || "uploads")) {}
  private async location(path: string) {
    if (!/^uploads\/[a-f0-9]{48}$/.test(path)) throw new Error("Invalid storage key");
    await mkdir(this.root, {recursive:true,mode:0o700});
    const stat = await lstat(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid storage root");
    return join(this.root,path.slice(8));
  }
  async put(file: Buffer, meta: StoredFile): Promise<StoredFile> {
    if (file.length > defaultFileValidation.maxSizeBytes) throw new Error("File too large");
    const path = "uploads/" + randomBytes(24).toString("hex");
    const target = await this.location(path);
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(file); } catch(e) { await handle.close(); await unlink(target).catch(()=>undefined); throw e; }
    await handle.close();
    return {...meta,path,size:file.length};
  }
  async read(path: string): Promise<Buffer> {
    const handle = await open(await this.location(path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > defaultFileValidation.maxSizeBytes) throw new Error("Invalid stored object");
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async delete(path: string): Promise<void> {
    const target = await this.location(path);
    await unlink(target).catch(e=>{if(e.code!=="ENOENT") throw e;});
  }
}
