import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { Observable, catchError, tap, throwError } from "rxjs";
import { AppLoggerService } from "./app-logger.service";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(AppLoggerService) private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      ip?: string;
      user?: { id?: string };
    }>();
    const res = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const started = Date.now();
    const method = req.method ?? "UNKNOWN";
    const path = req.url ?? "/";
    const ip = req.ip ?? "";
    const userId = req.user?.id;
    const logger = this.logger;

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - started;
        logger.info("request.completed", {
          context: "http",
          method,
          path,
          statusCode: res.statusCode ?? 200,
          durationMs,
          ip,
          userId
        });
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - started;
        const statusCode =
          typeof err === "object" && err !== null && "status" in err && typeof (err as { status?: number }).status === "number"
            ? (err as { status: number }).status
            : 500;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message?: unknown }).message ?? "unknown error")
              : "unknown error";

        logger.error("request.failed", {
          context: "http",
          method,
          path,
          statusCode,
          durationMs,
          ip,
          userId,
          errorMessage: message
        });
        return throwError(() => err);
      })
    );
  }
}

