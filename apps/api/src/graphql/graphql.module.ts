import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import {
  ApolloServerPluginLandingPageLocalDefault
} from "@apollo/server/plugin/landingPage/default";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { GraphQLJSON } from "graphql-scalars";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../common/prisma.service";
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
      // Apollo Server 5 landing page. Avoids the deprecated graphql-playground
      // plugin, which carries a non-optional @apollo/server@4 peer dependency
      // and causes peer conflicts on a clean install.
      playground: false,
      introspection: process.env.NODE_ENV !== "production" && process.env.OPENADMIN_GRAPHQL_INTROSPECTION !== "0",
      plugins: [
        (process.env.NODE_ENV === "production" || process.env.OPENADMIN_GRAPHQL_INTROSPECTION === "0")
          ? ApolloServerPluginLandingPageDisabled()
          : ApolloServerPluginLandingPageLocalDefault({ embed: true })
      ]
    }),
    AdminModule,
    AuthModule
  ],
  providers: [AdminResourcesResolver, PrismaService]
})
export class GraphqlApiModule {}
