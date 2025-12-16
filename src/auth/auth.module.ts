import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AzureADStrategy } from './strategies/azure-ad.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GraphService } from './services/graph.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): any => {
        return {
          secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1h',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AzureADStrategy, JwtStrategy, GraphService],
  exports: [AuthService, GraphService, JwtModule],
})
export class AuthModule {}

