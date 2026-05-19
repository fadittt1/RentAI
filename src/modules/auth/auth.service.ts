import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import * as bcrypt from 'bcrypt';
import type { JwtPayload, Role } from '../../common/auth/jwt-payload';
import { VerificationService } from './verification.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private verificationService: VerificationService,
  ) { }

  async register(registerDto: RegisterDto) {
    try {
      this.logger.log(
        `Registration attempt: ${registerDto.email ?? registerDto.phone}`,
      );

      if (!registerDto.email && !registerDto.phone) {
        throw new BadRequestException('Either email or phone must be provided');
      }

      const hashedPassword = await bcrypt.hash(registerDto.password, 10);
      this.logger.debug('Password hashed successfully');

      // Exclude password field, only send passwordHash
      // Also exclude firstName and lastName for the db entity itself, combining them into `name` if missing.
      const { password: _password, firstName, lastName, ...userDataWithoutPassword } = registerDto;

      let finalName = userDataWithoutPassword.name;
      if (!finalName) {
        finalName = [firstName, lastName].filter(Boolean).join(' ').trim();
      }
      if (!finalName) {
        finalName = 'User';
      }

      const user = await this.usersService.create({
        ...userDataWithoutPassword,
        name: finalName,
        passwordHash: hashedPassword,
      });
      this.logger.log(`User created: ${user.id}`);

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;

      return {
        user: result,
        ...tokens,
      };
    } catch (_error) {
      this.logger.error(`Registration error: ${_error.message}`);
      throw _error;
    }
  }

  async login(loginDto: LoginDto) {
    try {
      const identifier = loginDto.emailOrPhone || loginDto.email;
      if (!identifier) {
        throw new BadRequestException('emailOrPhone or email must be provided');
      }

      this.logger.log(`Login attempt for: ${identifier}`);

      const user = await this.usersService.findByEmailOrPhone(identifier);

      if (!user) {
        this.logger.warn(
          `Login failed — user not found: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // OAuth-only users have no password; tell them to use Google instead of
      // leaking that the account exists.
      if (!user.passwordHash) {
        this.logger.warn(
          `Login failed — OAuth-only account, no local password: ${identifier}`,
        );
        throw new UnauthorizedException(
          'This account was created with Google. Use "Continue with Google" instead.',
        );
      }

      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
      this.logger.debug(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(
          `Login failed — invalid password: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.suspendedAt) {
        this.logger.warn(`Login rejected — account suspended: ${user.id}`);
        throw new UnauthorizedException('Your account has been suspended');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );
      this.logger.log(`Login successful: ${user.id}`);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return {
        user: result,
        ...tokens,
      };
    } catch (_error) {
      if (_error instanceof UnauthorizedException) throw _error;
      this.logger.error(`Login error: ${_error.message}`);
      throw _error;
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('refreshToken.secret'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email || user.phone,
          role: this.getRoleForUser(user),
        } satisfies JwtPayload,
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: this.configService.get<string>('jwt.expiresIn'),
        },
      );

      return { accessToken };
    } catch (_error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async requestVerification(userId: string, dto: RequestVerificationDto) {
    const channel = dto.type === 'email' ? 'EMAIL' : 'PHONE';
    return this.verificationService.requestCode(userId, channel);
  }

  async verify(userId: string, verifyDto: VerifyDto) {
    const channel = verifyDto.type === 'email' ? 'EMAIL' : 'PHONE';
    const result = await this.verificationService.verifyCode(
      userId,
      channel,
      verifyDto.code,
    );
    return { message: 'Verification successful', ...result };
  }

  private getRoleForUser(user: { roles?: string[]; isHost?: boolean }): Role {
    const roles = (user.roles ?? []).map((r) => String(r).toUpperCase());
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (user.isHost) return 'HOST';
    return 'USER';
  }

  private async generateTokens(userId: string, identifier: string, role: Role) {
    const payload: JwtPayload = { sub: userId, email: identifier, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('refreshToken.secret'),
      expiresIn: this.configService.get<string>('refreshToken.expiresIn'),
    });

    return { accessToken, refreshToken };
  }

  // ─── OAuth (Google) ─────────────────────────────────────────────────────

  /**
   * Find a user by Google id, or link/create one. Called from the Passport
   * Google strategy after Google verifies the user's identity.
   */
  async findOrCreateFromGoogle(payload: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }) {
    return this.usersService.findOrCreateFromGoogle(payload);
  }

  /**
   * Issue access + refresh tokens for an already-authenticated user (e.g. the
   * one Passport just resolved from a Google profile).
   */
  async issueTokensFor(user: {
    id: string;
    email: string | null;
    phone: string | null;
    roles?: string[];
    isHost?: boolean;
    suspendedAt?: Date | null;
  }) {
    if (user.suspendedAt) {
      throw new UnauthorizedException('Your account has been suspended');
    }
    return this.generateTokens(
      user.id,
      user.email || user.phone || user.id,
      this.getRoleForUser(user),
    );
  }
}
