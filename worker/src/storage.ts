export interface StorageObject {
  body: ReadableStream;
  size: number;
  contentType: string;
}

export interface StorageBackend {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  getRange(key: string, offset: number, length: number): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
}

class R2StorageBackend implements StorageBackend {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, data, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StorageObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType || "application/octet-stream",
    };
  }

  async getRange(key: string, offset: number, length: number): Promise<StorageObject | null> {
    const obj = await this.bucket.get(key, { range: { offset, length } });
    if (!obj) return null;
    return {
      body: obj.body,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType || "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

class KVStorageBackend implements StorageBackend {
  constructor(private kv: KVNamespace) {}

  private dataKey(key: string): string {
    return `storage:${key}`;
  }

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.kv.put(this.dataKey(key), data, {
      metadata: { contentType, size: data.byteLength },
    });
  }

  async get(key: string): Promise<StorageObject | null> {
    const result = await this.kv.getWithMetadata(this.dataKey(key), "arrayBuffer");
    if (result.value === null) return null;
    const metadata = result.metadata as { contentType?: string; size?: number } | null;
    const buf = result.value as ArrayBuffer;
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        },
      }),
      size: metadata?.size ?? buf.byteLength,
      contentType: metadata?.contentType || "application/octet-stream",
    };
  }

  async getRange(key: string, offset: number, length: number): Promise<StorageObject | null> {
    const result = await this.kv.getWithMetadata(this.dataKey(key), "arrayBuffer");
    if (result.value === null) return null;
    const buf = result.value as ArrayBuffer;
    const sliced = buf.slice(offset, offset + length);
    const metadata = result.metadata as { contentType?: string } | null;
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(sliced));
          controller.close();
        },
      }),
      size: sliced.byteLength,
      contentType: metadata?.contentType || "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(this.dataKey(key));
  }
}

export function getStorage(env: { BUCKET?: R2Bucket; STORAGE_KV?: KVNamespace }): StorageBackend {
  if (env.BUCKET) {
    return new R2StorageBackend(env.BUCKET);
  }
  if (env.STORAGE_KV) {
    return new KVStorageBackend(env.STORAGE_KV);
  }
  throw new Error("No storage backend available. Configure either BUCKET (R2) or STORAGE_KV (KV) binding.");
}
