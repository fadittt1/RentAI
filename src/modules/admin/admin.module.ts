import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { WalletModule } from '../wallet/wallet.module';
import { ChatbotModule } from '../../chatbot/chatbot.module';

@Module({
  imports: [UsersModule, LedgerModule, PayoutsModule, WalletModule, ChatbotModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
