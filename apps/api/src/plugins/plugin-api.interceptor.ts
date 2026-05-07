import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { pluginRuntime } from "./plugin-runtime";

@Injectable()
export class PluginApiInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      path?: string;
      body?: unknown;
      query?: Record<string, unknown>;
      user?: { id?: string; email?: string; permissions?: string[] };
    }>();
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const method = request.method ?? "GET";
    const path = request.route?.path ?? request.path ?? "/";
    const started = Date.now();
    for (const hook of pluginRuntime.getApiHooks()) {
      void hook.beforeRequest?.({
        method,
        path,
        body: request.body,
        query: request.query,
        user: request.user?.id ? { id: request.user.id, email: request.user.email ?? "", permissions: request.user.permissions ?? [] } : undefined
      });
    }
    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - started;
          for (const hook of pluginRuntime.getApiHooks()) {
            void hook.afterRequest?.({
              method,
              path,
              statusCode: response.statusCode ?? 200,
              durationMs,
              user: request.user?.id ? { id: request.user.id, email: request.user.email ?? "", permissions: request.user.permissions ?? [] } : undefined
            });
          }
        }
      })
    );
  }
}
