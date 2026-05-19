import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') ?? 'unset',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') ?? 'unset',
      // Backend must be reachable at this URL from the user's browser
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:3001/api/auth/google/callback',
      scope: ['email', 'profile'],
      // We forward the ?next= query value through Google so we can route the
      // user back to where they came from after login.
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      const photo = profile.photos?.[0]?.value;
      const name = profile.displayName?.trim() || email?.split('@')[0] || 'User';

      if (!email) {
        return done(new Error('Google did not return an email address'), undefined);
      }

      const user = await this.authService.findOrCreateFromGoogle({
        googleId: profile.id,
        email,
        name,
        avatarUrl: photo,
      });

      done(null, user);
    } catch (err: any) {
      this.logger.error(`Google validate failed: ${err?.message ?? err}`);
      done(err, undefined);
    }
  }
}
