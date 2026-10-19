/** Site, locale, and route parameters supplied to route modules. */
export interface RouteContext {
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale: string;
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Named route parameters supplied to the host route module.
   */
  params: Record<string, string>;
}

/** Concrete localized route path and optional canonical URL. */
export interface RoutePath {
  /**
   * Concrete localized URL path to render.
   */
  pathname: string;
  /**
   * Named route parameters supplied to the host route module.
   */
  params: Record<string, string>;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale: string;
  /**
   * Optional canonical URL for the rendered path.
   */
  canonical?: string;
}

/** Resolved route path and execution context passed to a renderer. */
export interface RouteRenderInput {
  /**
   * Resolved localized path selected for rendering.
   */
  path: RoutePath;
  /**
   * Execution context passed to the host callback.
   */
  context: RouteContext;
}

/** Host route boundary for enumerating paths and rendering resolved input. */
export interface RouteModule {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Host-defined domain labels served by this route module.
   */
  domains: string[];
  /**
   * Enumerates concrete paths provided by this route module.
   *
   * @param context - Site, locale, and route parameters.
   * @returns Paths available for rendering.
   * @example
   * ```ts
   * import type { RouteModule } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<RouteModule['getPaths']>;
   * export function invoke(host: RouteModule, ...args: Parameters<Callback>) {
   *   return host.getPaths(...args);
   * }
   * ```
   */
  getPaths(context: RouteContext): Promise<RoutePath[]>;
  /**
   * Renders one resolved route using host-defined output.
   *
   * @param input - Concrete path and route context.
   * @returns The rendered result.
   * @example
   * ```ts
   * import type { RouteModule } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<RouteModule['render']>;
   * export function invoke(host: RouteModule, ...args: Parameters<Callback>) {
   *   return host.render(...args);
   * }
   * ```
   */
  render(input: RouteRenderInput): Promise<unknown>;
}
