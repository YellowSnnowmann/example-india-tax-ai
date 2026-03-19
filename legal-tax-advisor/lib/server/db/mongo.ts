import mongoose from "mongoose";
import { getConfig } from "../config";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.__mongooseCache ?? { conn: null, promise: null };
global.__mongooseCache = cache;

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  const { DATABASE_URL } = getConfig();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(DATABASE_URL, {
        bufferCommands: false,
      })
      .then((m) => m);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

