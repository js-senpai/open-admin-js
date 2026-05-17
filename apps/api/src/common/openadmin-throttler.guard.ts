import { ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

type HeaderWritable = Record<string, unknown> & {
  header?: (name: string, value: string | number) => unknown;
};

const noopResponse: HeaderWritable = {
  header: () => undefined
};

function isHeaderWritable(input: unknown): input is HeaderWritable {
  return Boolean(input && typeof input === "object" && "header" in input);
}

@Injectable()
export class OpenAdminThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: HeaderWritable;
  } {
    if (context.getType<string>() === "graphql") {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req?: Record<string, unknown>;
        res?: unknown;
      }>();
      return {
        req: gqlContext.req ?? {},
        res: isHeaderWritable(gqlContext.res) ? gqlContext.res : noopResponse
      };
    }

    return super.getRequestResponse(context) as {
      req: Record<string, unknown>;
      res: HeaderWritable;
    };
  }
}
