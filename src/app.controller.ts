import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  /** Docker healthcheck target — see docker-compose.dev.yml / docker-compose.prod.yml. */
  @Public()
  @Get('health')
  @ApiExcludeEndpoint()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
