import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';

// Global: sales send receipts and other flows will want the same single
// recorded path rather than each holding their own gateway client.
@Global()
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
