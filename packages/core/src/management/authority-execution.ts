import { ManagementFault } from './errors.js';
import type { ManagementScope } from './contracts.js';
import type { AuthorityOwner, AuthorityPermit, ConnectionStatus } from './authority.js';
/** Server-only control channel. Browser connection commands never expose these permit methods. */
export interface AuthorityExecutionControl {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutionControl} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutionControl>['status'],...args:Parameters<NonNullable<AuthorityExecutionControl>['status']>) => operation(...args);
     */

  status(): Promise<ConnectionStatus>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param id - Durable identity retained across retries.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutionControl} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutionControl>['permit'],...args:Parameters<NonNullable<AuthorityExecutionControl>['permit']>) => operation(...args);
     */

  permit(id: string): Promise<AuthorityPermit | null>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutionControl} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutionControl>['issue'],...args:Parameters<NonNullable<AuthorityExecutionControl>['issue']>) => operation(...args);
     */

  issue(input: {
    /** Durable identity retained across retries. */

    id: string;
    /** Exclusive configured execution owner. */

    owner: AuthorityOwner;
    /** Opaque execution generation; previous generations cannot dispatch. */

    epoch: string;
    /** Server-authorized operation identity. */

    operation: string;
    /** Immutable operation-input identity; changed replays conflict. */

    fingerprint: string
  }): Promise<{
    /** Trusted server-supplied operation value. */

    created: boolean;
    /** Optional effect admission updated in the same atomic commit. */

    permit: AuthorityPermit
  }>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutionControl} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutionControl>['finish'],...args:Parameters<NonNullable<AuthorityExecutionControl>['finish']>) => operation(...args);
     */

  finish(input: {
    /** Durable identity retained across retries. */

    id: string;
    /** Trusted server-supplied operation value. */

    outcome: 'completed' | 'not-executed' | 'unknown';
    /** Trusted durable evidence for a definitive effect outcome. */

    proof?: string
  }): Promise<unknown>;
}
/** Immutable effect identity; retries of an external effect must retain this identity. */
export interface AuthorityExecutionInput {
  /** Durable identity retained across retries. */

  id: string;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string;
  /** Server-authorized operation identity. */

  operation: string;
  /** Immutable operation-input identity; changed replays conflict. */

  fingerprint: string
}
/** Server-side operation fence; successful callbacks must have durably committed their own state. */
export interface AuthorityExecutor {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @param work - Verified operation input.
     * @param uncertain - Verified operation input.
     * @typeParam T - Successful operation result.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutor} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutor>['reconcile'],...args:Parameters<NonNullable<AuthorityExecutor>['reconcile']>) => operation(...args);
     */

  reconcile<T>(input: AuthorityExecutionInput, work: () => Promise<T>, uncertain: (value: T) => boolean): Promise<T>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @param outcome - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutor} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutor>['resolve'],...args:Parameters<NonNullable<AuthorityExecutor>['resolve']>) => operation(...args);
     */

  resolve(input: AuthorityExecutionInput, outcome: 'completed' | 'not-executed'): Promise<void>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @param work - Verified operation input.
     * @param uncertain - Verified operation input.
     * @typeParam T - Successful operation result.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityExecutor} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityExecutor>['perform'],...args:Parameters<NonNullable<AuthorityExecutor>['perform']>) => operation(...args);
     */

  perform<T>(input: AuthorityExecutionInput, work: () => Promise<T>, uncertain?: (value: T) => boolean): Promise<T>;
}
/**
 * Creates a fail-closed durable permit wrapper. Thrown or uncertain work remains unresolved until verified reconciliation.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createAuthorityExecutor} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof createAuthorityExecutor,...args:Parameters<typeof createAuthorityExecutor>) => operation(...args);
 */
export function createAuthorityExecutor(o: {
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Authenticated server-only authority channel. */

  control: AuthorityExecutionControl;
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param permit - Optional effect admission updated in the same atomic commit.
     * @param outcome - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import {createAuthorityExecutor} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<Parameters<typeof createAuthorityExecutor>[0]>['proof'],...args:Parameters<NonNullable<Parameters<typeof createAuthorityExecutor>[0]>['proof']>) => operation(...args);
     */

  proof(permit: AuthorityPermit, outcome: 'completed' | 'not-executed'): Promise<string>
}): AuthorityExecutor {
  const scope = Object.freeze({ ...o.scope });
  const validate = async (input: AuthorityExecutionInput) => { const s = await o.control.status(), p = await o.control.permit(input.id); if (s.scope.tenantId !== scope.tenantId || s.scope.siteId !== scope.siteId || s.owner !== o.owner || s.epoch !== input.epoch || !p || p.owner !== o.owner || p.epoch !== input.epoch || p.operation !== input.operation || p.fingerprint !== input.fingerprint) throw new ManagementFault('conflict'); return p };
  const executor: AuthorityExecutor = {
    async reconcile(input, work, uncertain) { const permit = await validate(input); if (!['open', 'unknown'].includes(permit.status)) throw new ManagementFault('conflict'); const value = await work(); if (!uncertain(value)) await executor.resolve(input, 'completed'); return value }, async resolve(input, outcome) {
      const s = await o.control.status(), permit = await o.control.permit(input.id);
      if (s.scope.tenantId !== scope.tenantId || s.scope.siteId !== scope.siteId || s.owner !== o.owner || s.epoch !== input.epoch || !permit || permit.owner !== o.owner || permit.epoch !== input.epoch || permit.operation !== input.operation || permit.fingerprint !== input.fingerprint) throw new ManagementFault('conflict');
      if (permit.status === outcome) return;
      const proof = await o.proof(permit, outcome); await o.control.finish({ id: input.id, outcome, proof });
    }, async perform(input, work, uncertain) {
      const s = await o.control.status(); if (s.scope.tenantId !== scope.tenantId || s.scope.siteId !== scope.siteId || s.owner !== o.owner || s.epoch !== input.epoch) throw new ManagementFault('conflict'); if (!s.active) throw new ManagementFault('unavailable');
      const issued = await o.control.issue({ ...input, owner: o.owner }); if (!issued.created) throw new ManagementFault('conflict');
      let value;
      try { value = await work() } catch (error) { await o.control.finish({ id: input.id, outcome: 'unknown' }); throw error }
      if (uncertain?.(value)) { await o.control.finish({ id: input.id, outcome: 'unknown' }); return value }
      const proof = await o.proof(issued.permit, 'completed'); await o.control.finish({ id: input.id, outcome: 'completed', proof }); return value;
    }
  }; return executor;
}
