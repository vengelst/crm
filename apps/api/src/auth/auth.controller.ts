import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { EmergencyLoginDto } from './dto/emergency-login.dto';
import { KioskLoginDto } from './dto/kiosk-login.dto';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    email?: string;
    roles: string[];
    permissions?: string[];
    type: 'user' | 'worker' | 'kiosk-user' | 'emergency-admin';
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Public Feature-Flag-Endpoint. Liefert nur das, was der Login-Screen
   * fuer die UI-Entscheidung braucht — keine Credentials, kein Secret.
   */
  @Public()
  @Get('config')
  getConfig() {
    return {
      emergencyLogin: {
        enabled: this.authService.isEmergencyAdminEnabled(),
      },
    };
  }

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

  /**
   * Notfall-/Break-Glass-Admin. Pruefung ausschliesslich gegen ENV — auch bei
   * DB-Ausfall erreichbar. Standardmaessig ueber EMERGENCY_ADMIN_ENABLED
   * deaktiviert.
   */
  @Public()
  @Post('emergency-login')
  emergencyLogin(@Body() dto: EmergencyLoginDto, @Req() request: Request) {
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      headers[key.toLowerCase()] = value;
    }
    return this.authService.emergencyLogin(dto, {
      ip: request.ip,
      headers,
    });
  }

  @Get('me')
  me(@Req() request: RequestWithUser) {
    const user = request.user;
    if (!user) return null;
    return {
      sub: user.sub,
      email: user.email,
      type: user.type,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    };
  }
}
