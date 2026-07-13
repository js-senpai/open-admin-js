import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { isSqliteDatabaseUrl, sqliteJsonCodecExtension } from "./json-field-codec";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (isSqliteDatabaseUrl(url)) {
      const client = new PrismaClient();
      // Constructor return replaces `this` — extended client keeps full delegate API.
      return client.$extends(
        sqliteJsonCodecExtension() as Parameters<PrismaClient["$extends"]>[0]
      ) as unknown as PrismaService;
    }
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
