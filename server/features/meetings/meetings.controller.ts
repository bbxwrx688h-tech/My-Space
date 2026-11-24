import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Person } from '../../../shared/model';
import { meetingQuery } from '../../../shared/contracts/meeting';
import { Employee, SessionGuard } from '../../auth/session';
import { parse } from '../../common/validation/parse';
import { MeetingChangeService } from './meeting-change.service';
import { MeetingRepository } from './meeting.repository';

@Controller('meetings')
@UseGuards(SessionGuard)
export class MeetingsController {
  constructor(
    private readonly repository: MeetingRepository,
    private readonly changeService: MeetingChangeService,
  ) {}

  @Get() list(@Employee() viewer: Person, @Query() query: unknown) {
    const { room, start } = parse(meetingQuery, query);
    return this.repository.listRoom(room, start, viewer);
  }

  @Post() change(@Employee() requester: Person, @Body() body: unknown) {
    return this.changeService.apply(requester, body);
  }
}
