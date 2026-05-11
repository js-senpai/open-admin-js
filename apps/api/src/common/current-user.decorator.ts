import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const type = context.getType<string>();
  if (type === "graphql") {
    return GqlExecutionContext.create(context).getContext<{ req: { user?: unknown } }>().req.user;
  }
  return context.switchToHttp().getRequest().user;
});
