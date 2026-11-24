import { Module } from '@nestjs/common';
import { StationService } from './station.service';
import { StationsController } from './stations.controller';

@Module({
  controllers: [StationsController],
  providers: [StationService],
})
export class StationsModule {}
