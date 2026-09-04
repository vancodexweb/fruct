import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Translates known Prisma error codes into meaningful HTTP responses instead
 * of letting them bubble up as an opaque 500. Anything we don't recognize
 * still becomes a 500, but is logged with full detail server-side first.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const httpException = this.toHttpException(exception);

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttpException(exception: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta.target as string[]).join(', ')
          : String(exception.meta?.target ?? 'поле');
        return new ConflictException(`Запись с таким значением поля "${target}" уже существует.`);
      }
      case 'P2025':
        return new NotFoundException('Запись не найдена.');
      case 'P2003':
        return new ConflictException('Операция нарушает ссылочную целостность данных.');
      default:
        this.logger.error(`Необработанная ошибка Prisma [${exception.code}]: ${exception.message}`);
        return new InternalServerErrorException('Внутренняя ошибка сервера при работе с базой данных.');
    }
  }
}
