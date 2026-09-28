import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RolesController } from '../roles/roles.controller';

@Module({ controllers: [UsersController, RolesController] })
export class UsersModule {}
