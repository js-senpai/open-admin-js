import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { GraphQLJSON } from "graphql-scalars";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { AdminResourcesResolver } from "./admin-resources.resolver";

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: "/graphql",
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
      resolvers: { JSON: GraphQLJSON },
      playground: process.env.NODE_ENV !== "production"
    }),
    AdminModule,
    AuthModule
  ],
  providers: [AdminResourcesResolver]
})
export class GraphqlApiModule {}
