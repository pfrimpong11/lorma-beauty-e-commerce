import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Field-level validation detail, when applicable. */
  details?: Record<string, string[]>;
  /** Machine-readable code the frontend can branch on. */
  code?: string;
  /** Correlates the user-facing message with the server log line. */
  reference: string;
  path: string;
  timestamp: string;
}

/**
 * Single exit point for every error leaving the API.
 *
 * Users see a plain sentence and a reference id. Stack traces, SQL, Prisma
 * error text and constraint names are logged server-side and never
 * serialised into the response (PROMPT.md §31).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reference = randomUUID();

    const resolved = this.resolve(exception);

    const body: ApiErrorBody = {
      statusCode: resolved.status,
      error: resolved.error,
      message: resolved.message,
      ...(resolved.details ? { details: resolved.details } : {}),
      ...(resolved.code ? { code: resolved.code } : {}),
      reference,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (resolved.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${reference}] ${request.method} ${request.url} -> ${resolved.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${reference}] ${request.method} ${request.url} -> ${resolved.status}: ${resolved.message}`,
      );
    }

    response.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    error: string;
    message: string;
    details?: Record<string, string[]>;
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;
        return {
          status,
          error: (p.error as string) ?? exception.name,
          message: Array.isArray(p.message)
            ? 'Please correct the highlighted fields.'
            : ((p.message as string) ?? exception.message),
          details: Array.isArray(p.message)
            ? { _: p.message as string[] }
            : (p.details as Record<string, string[]> | undefined),
          code: p.code as string | undefined,
        };
      }

      return { status, error: exception.name, message: String(payload) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'The request could not be processed. Please check the submitted values.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong on our side. Please try again.',
    };
  }

  /** Map Prisma codes to user-safe sentences — no constraint names leak out. */
  private fromPrisma(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: string;
    message: string;
    code?: string;
  } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | undefined)?.join(', ');
        const field = target ? this.humanise(target) : 'value';
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `That ${field} is already in use.`,
          code: 'DUPLICATE',
        };
      }
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'A related record was not found. Please refresh and try again.',
          code: 'FK_VIOLATION',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'The requested record no longer exists.',
          code: 'NOT_FOUND',
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'That action collided with another change. Please try again.',
          code: 'WRITE_CONFLICT',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Something went wrong on our side. Please try again.',
        };
    }
  }

  private humanise(field: string): string {
    return field
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();
  }
}
