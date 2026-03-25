import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { KioskLoginDto } from './dto/kiosk-login.dto';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    roles: string[];
    type: 'user' | 'worker';
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('pin-login')
  pinLogin(@Body() dto: PinLoginDto) {
    return this.authService.pinLogin(dto);
  }

  @Public()
  @Post('kiosk-login')
  kioskLogin(@Body() dto: KioskLoginDto) {
    return this.authService.kioskLogin(dto);
  }

  @Get('me')
  me(@Req() request: RequestWithUser) {
    return request.user ?? null;
  }
}
