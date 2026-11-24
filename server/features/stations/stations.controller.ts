import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Person } from '../../../shared/model';
import { Employee, SessionGuard } from '../../auth/session';
import { StationService } from './station.service';

@Controller('stations')
@UseGuards(SessionGuard)
export class StationsController {
  constructor(private readonly service: StationService) {}

  @Post() create(@Employee() me: Person, @Body() body: unknown) {
    return this.service.create(me, body);
  }

  @Post('offers') publish(@Employee() me: Person, @Body() body: unknown) {
    return this.service.publish(me, body);
  }

  @Post('days') changeDays(@Employee() me: Person, @Body() body: unknown) {
    return this.service.changeDays(me, body);
  }
}
