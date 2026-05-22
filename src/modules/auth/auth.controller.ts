import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyDto } from './dto/verify.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LogoutDto } from './dto/logout.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Public()
  @Post('logout')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Revoke a refresh token (sign out)',
    description:
      'Marks the refresh token revoked so it can no longer be exchanged for an ' +
      'access token. Idempotent — calling without a token (or with a bad one) ' +
      'still returns 200 so the client can always perform a clean local logout.',
  })
  @ApiResponse({ status: 200, description: 'Signed out' })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sign out of every device for the current user',
    description:
      'Revokes every refresh token for this account. Other devices keep ' +
      'working until their current access token expires (≤ 15min), then they ' +
      'are forced to log in again.',
  })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  async logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Change the current user\'s password',
    description:
      'Requires the current password to confirm. On success, every other ' +
      'session is invalidated.',
  })
  @ApiResponse({ status: 200, description: 'Password updated' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('request-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a 6-digit verification code to the current user',
    description:
      'Sends a code to the user\'s email or phone. Codes expire after 10 minutes. ' +
      'In dev (no RESEND_API_KEY / TWILIO_*), the code is logged to the backend console.',
  })
  @ApiResponse({ status: 201, description: 'Code sent' })
  async requestVerification(
    @Request() req,
    @Body() dto: RequestVerificationDto,
  ) {
    return this.authService.requestVerification(req.user.sub, dto);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email or phone with a 6-digit code' })
  @ApiResponse({ status: 200, description: 'Verification successful' })
  async verify(@Request() req, @Body() verifyDto: VerifyDto) {
    return this.authService.verify(req.user.sub, verifyDto);
  }

  // ─── Password reset ────────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Always responds 200 with the same message whether or not the email is registered, ' +
      'to avoid leaking which accounts exist. In dev (no RESEND_API_KEY), the reset link ' +
      'is logged to the backend console.',
  })
  @ApiResponse({ status: 200, description: 'Reset email sent if the account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Request() req: any) {
    const ip = (req?.ip as string | undefined) ?? undefined;
    return this.passwordResetService.requestReset(dto.email, ip);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set a new password using a token from the reset email' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto.token, dto.password);
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────

  /**
   * Starts the Google OAuth flow. Frontend redirects the user here; we then
   * redirect to Google's consent screen. The `next` query param is round-
   * tripped through the OAuth `state` so we can return the user to where
   * they came from after the callback.
   */
  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Begin Google OAuth flow (redirects to Google)' })
  async googleAuth(
    @Query('next') next: string | undefined,
    @Res() res: Response,
  ) {
    // We build the redirect URL manually so we can attach `state` ourselves
    // without coupling to passport's internal session machinery.
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const callbackUrl =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3001/api/auth/google/callback';

    if (!clientId) {
      return res
        .status(500)
        .json({ message: 'Google OAuth is not configured on this server' });
    }

    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const state = encodeURIComponent(safe);
    const scope = encodeURIComponent('openid email profile');
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${scope}` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=select_account`;

    return res.redirect(url);
  }

  /**
   * Google sends the user back here. Passport exchanges the code for a profile;
   * we issue our own JWT and redirect to the frontend callback page with the
   * tokens in the URL fragment so they don't end up in server logs.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Request() req: any,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const frontendBase =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const next = (() => {
      if (!state) return '/';
      try {
        const decoded = decodeURIComponent(state);
        return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : '/';
      } catch {
        return '/';
      }
    })();

    if (!req.user) {
      return res.redirect(`${frontendBase}/auth/login?oauth_error=1`);
    }

    const tokens = await this.authService.issueTokensFor(req.user);
    // Use the URL fragment for tokens — fragments aren't sent in HTTP requests
    // and don't appear in server logs or Referer headers.
    const fragment =
      `accessToken=${encodeURIComponent(tokens.accessToken)}` +
      `&refreshToken=${encodeURIComponent(tokens.refreshToken)}` +
      `&next=${encodeURIComponent(next)}`;
    return res.redirect(`${frontendBase}/auth/oauth-callback#${fragment}`);
  }
}
