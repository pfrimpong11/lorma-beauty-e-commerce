import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS, CASHIER_PERMISSIONS, ADMIN_PERMISSIONS } from '../permissions';
import type { AuthenticatedUser } from '../decorators';

function contextFor(user?: Partial<AuthenticatedUser>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  const require = (permissions: string[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);

  it('allows a route that declares no permissions', () => {
    require(undefined);
    expect(guard.canActivate(contextFor({ permissions: [] }))).toBe(true);
  });

  it('allows a user holding the required permission', () => {
    require([PERMISSIONS.SALE_CREATE]);
    expect(guard.canActivate(contextFor({ permissions: [...CASHIER_PERMISSIONS] }))).toBe(true);
  });

  it('blocks a cashier from changing prices (§51.4)', () => {
    require([PERMISSIONS.PRODUCT_UPDATE_PRICE]);
    expect(() =>
      guard.canActivate(contextFor({ permissions: [...CASHIER_PERMISSIONS] })),
    ).toThrow(ForbiddenException);
  });

  it('blocks a cashier from managing users', () => {
    require([PERMISSIONS.USER_MANAGE]);
    expect(() => guard.canActivate(contextFor({ permissions: [...CASHIER_PERMISSIONS] }))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks a cashier from unrestricted inventory adjustment (§51.5)', () => {
    require([PERMISSIONS.INVENTORY_ADJUST]);
    expect(() => guard.canActivate(contextFor({ permissions: [...CASHIER_PERMISSIONS] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an admin everything', () => {
    for (const permission of [
      PERMISSIONS.PRODUCT_UPDATE_PRICE,
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.REPORT_VIEW_FINANCIAL,
    ]) {
      require([permission]);
      expect(guard.canActivate(contextFor({ permissions: [...ADMIN_PERMISSIONS] }))).toBe(true);
    }
  });

  it('rejects an unauthenticated request on a guarded route', () => {
    require([PERMISSIONS.SALE_CREATE]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('does not leak which permission was missing', () => {
    require([PERMISSIONS.USER_MANAGE]);
    try {
      guard.canActivate(contextFor({ permissions: [] }));
      fail('should have thrown');
    } catch (error) {
      expect((error as ForbiddenException).message).not.toContain('user.manage');
    }
  });
});
