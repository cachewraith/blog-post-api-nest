import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../../../common/decorators/response-message.decorator';
import { UserResponseDto, toUserResponse } from '../dto/user-response.dto';
import { UsersService } from '../services/users.service';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** The id comes from the verified token, so one user cannot read another. */
  @Get('me')
  @ResponseMessage('Profile retrieved')
  async me(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return toUserResponse(await this.usersService.findByIdOrFail(userId));
  }
}
