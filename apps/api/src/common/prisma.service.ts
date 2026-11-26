import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { isSqliteDatabaseUrl, sqliteJsonCodecExtension } from "./json-field-codec";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // Native JSON for new SQLite projects. Retain legacy compatibility only
    // when the generated Prisma schema still uses text for old JSON fields.
    const legacy = Prisma.dmmf.datamodel.models.find(model => model.name === "AuditLog")?.fields.some(field => field.name === "after" && field.type === "String");
    if (isSqliteDatabaseUrl(process.env.DATABASE_URL) && legacy) {
      return this.$extends(sqliteJsonCodecExtension() as Parameters<PrismaClient["$extends"]>[0]) as unknown as PrismaService;
    }
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
