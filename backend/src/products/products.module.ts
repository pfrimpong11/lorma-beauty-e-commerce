import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodesService } from './barcodes.service';
import { VariantsService } from './variants.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, BarcodesService, VariantsService],
  // Exported so stock receiving and stock counts resolve barcodes through
  // the same lookup rather than reimplementing it.
  exports: [BarcodesService, VariantsService],
})
export class ProductsModule {}
