import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles(Role.OWNER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Registered before the ":id" routes below on purpose — see the routing
  // note in users.module.ts history / commit message: Express matches path
  // patterns in registration order, and "/users/me" must win over "/users/:id".

  @Get('me')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Профиль текущего пользователя' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getOwnProfile(user.id);
  }

  @Patch('me')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({
    summary: 'Обновление собственного профиля (только ФИО — % комиссии и оклад менять нельзя даже себе)',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOwnProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateOwnProfile(user.id, dto);
  }

  @Post()
  @ApiOperation({ summary: '[Только OWNER] Создать менеджера' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createManager(dto);
  }

  @Get()
  @ApiOperation({ summary: '[Только OWNER] Список менеджеров тенанта' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.listManagers();
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Только OWNER] Изменить данные менеджера (ФИО, % комиссии, оклад, лимит скидки)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.usersService.updateManager(id, dto);
  }

  @Patch(':id/block')
  @ApiOperation({ summary: '[Только OWNER] Заблокировать менеджера' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  block(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.blockManager(id);
  }

  @Patch(':id/unblock')
  @ApiOperation({ summary: '[Только OWNER] Разблокировать менеджера' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  unblock(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.unblockManager(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Только OWNER] Мягко удалить менеджера (деактивация + анонимизация email)' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.deleteManager(id);
  }
}
