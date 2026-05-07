import type {
  AdminUiExtension,
  ApiHooks,
  JobHandler,
  MediaHooks,
  PluginSurfaceRegistry,
  ResourceLifecycleHooks,
  SeoHooks
} from "@openadminjs/plugin-sdk";

type SurfaceEntry<T> = {
  source: string;
  value: T;
};

class PluginRuntimeBus {
  private readonly resourceHooks = new Map<string, SurfaceEntry<ResourceLifecycleHooks>[]>();
  private readonly apiHooks: SurfaceEntry<ApiHooks>[] = [];
  private readonly mediaHooks: SurfaceEntry<MediaHooks>[] = [];
  private readonly seoHooks: SurfaceEntry<SeoHooks>[] = [];
  private readonly jobs: SurfaceEntry<JobHandler>[] = [];
  private readonly adminUi: SurfaceEntry<AdminUiExtension>[] = [];

  register(source: string, surface: PluginSurfaceRegistry, resourceName?: string): void {
    if (surface.resource && resourceName) {
      const chain = this.resourceHooks.get(resourceName) ?? [];
      chain.push({ source, value: surface.resource });
      this.resourceHooks.set(resourceName, chain);
    }
    if (surface.api) this.apiHooks.push({ source, value: surface.api });
    if (surface.media) this.mediaHooks.push({ source, value: surface.media });
    if (surface.seo) this.seoHooks.push({ source, value: surface.seo });
    if (surface.jobs) {
      for (const handler of surface.jobs) this.jobs.push({ source, value: handler });
    }
    if (surface.adminUi) {
      for (const extension of surface.adminUi) this.adminUi.push({ source, value: extension });
    }
  }

  removeBySource(source: string): void {
    for (const [name, entries] of this.resourceHooks.entries()) {
      const filtered = entries.filter((entry) => entry.source !== source);
      if (filtered.length === 0) this.resourceHooks.delete(name);
      else this.resourceHooks.set(name, filtered);
    }
    this.removeInPlace(this.apiHooks, source);
    this.removeInPlace(this.mediaHooks, source);
    this.removeInPlace(this.seoHooks, source);
    this.removeInPlace(this.jobs, source);
    this.removeInPlace(this.adminUi, source);
  }

  getResourceHookChain(resourceName: string): ResourceLifecycleHooks[] {
    return (this.resourceHooks.get(resourceName) ?? []).map((entry) => entry.value);
  }

  getApiHooks(): ApiHooks[] {
    return this.apiHooks.map((item) => item.value);
  }

  getMediaHooks(): MediaHooks[] {
    return this.mediaHooks.map((item) => item.value);
  }

  getSeoHooks(): SeoHooks[] {
    return this.seoHooks.map((item) => item.value);
  }

  getJobs(): JobHandler[] {
    return this.jobs.map((item) => item.value);
  }

  getAdminUiExtensions(): AdminUiExtension[] {
    return this.adminUi.map((item) => item.value);
  }

  private removeInPlace<T>(list: SurfaceEntry<T>[], source: string): void {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.source === source) list.splice(i, 1);
    }
  }
}

export const pluginRuntime = new PluginRuntimeBus();
