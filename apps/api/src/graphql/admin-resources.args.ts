import { ArgsType, Field, Int } from "@nestjs/graphql";
import { GraphQLJSON } from "graphql-scalars";
import { ensureGqlFieldTypes } from "./ensure-gql-paramtypes";

@ArgsType()
export class AdminResourceListArgs {
  @Field(() => String)
  name!: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  limit?: number;

  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => String, { nullable: true })
  sort?: string;

  @Field(() => String, { nullable: true })
  locale?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  filter?: unknown;
}

@ArgsType()
export class AdminResourceRecordArgs {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  id!: string;
}

ensureGqlFieldTypes(AdminResourceListArgs.prototype, {
  name: String,
  page: Number,
  limit: Number,
  search: String,
  sort: String,
  locale: String,
  filter: GraphQLJSON
});
ensureGqlFieldTypes(AdminResourceRecordArgs.prototype, {
  name: String,
  id: String
});
