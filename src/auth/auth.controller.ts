import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * Deliberately NOT present here: POST /auth/register. There is no public
 * self-registration in this system — the only accounts are the first OWNER
 * created once by prisma/seed.ts, and managers created by an OWNER via
 * POST /users.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход по email и паролю' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({
    status: 401,
    description: 'Неверный email или пароль, либо учётная запись заблокирована.',
  })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновление пары токенов по refresh-токену (с ротацией)' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({
    status: 401,
    description: 'Refresh-токен недействителен, истёк или уже использован.',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Выход — отзыв конкретного refresh-токена (текущей сессии)' })
  @ApiResponse({ status: 204 })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Запрос на сброс пароля. Ответ одинаковый независимо от того, найден ли email.',
  })
  @ApiResponse({ status: 204 })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Установка нового пароля по токену из письма' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Токен сброса пароля недействителен или устарел.' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }
}
