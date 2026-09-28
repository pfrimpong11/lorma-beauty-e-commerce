import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, type AuthenticatedUser } from '../decorators';
import type { PermissionCode } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException('You do not have access to this action.');

    const held = new Set(user.permissions);
    const missing = required.filter((p) => !held.has(p));

    if (missing.length > 0) {
      // The specific missing codes go to the log, not to the client.
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }
}
