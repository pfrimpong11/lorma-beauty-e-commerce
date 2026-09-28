import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';

@Module({
  // For BarcodesService — counts resolve codes through the same lookup
  // the rest of the application uses.
  imports: [ProductsModule],
  controllers: [StockCountsController],
  providers: [StockCountsService],
})
export class StockCountsModule {}
