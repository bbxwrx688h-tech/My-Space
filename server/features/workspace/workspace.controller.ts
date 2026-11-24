import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Person } from '../../../shared/model';
import {
  noticeReadBody,
  onboardingBody,
  peopleSearchQuery,
  roleBody,
  roomBody,
  supervisorBody,
} from '../../../shared/contracts/workspace';
import { Employee, SessionGuard } from '../../auth/session';
import { parse } from '../../common/validation/parse';
import { WorkspaceRepository } from './workspace.repository';
import { WorkspaceService } from './workspace.service';

@Controller()
@UseGuards(SessionGuard)
export class WorkspaceController {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly service: WorkspaceService,
  ) {}

  @Get('workspace') read(@Employee() me: Person) {
    return this.repository.read(me);
  }

  @Post('onboarding') onboard(@Employee() me: Person, @Body() body: unknown) {
    return this.service.onboard(me, parse(onboardingBody, body));
  }

  @Post('notices/read') async markRead(@Employee() me: Person, @Body() body: unknown) {
    return this.service.markRead(me, parse(noticeReadBody, body));
  }

  @Get('admin/users') async users(@Employee() me: Person) {
    return this.service.users(me);
  }

  @Get('people/search') async searchPeople(@Employee() me: Person, @Query() query: unknown) {
    return this.service.searchPeople(me, parse(peopleSearchQuery, query));
  }

  @Post('admin/rooms') async createRoom(@Employee() me: Person, @Body() body: unknown) {
    return this.service.createRoom(me, parse(roomBody, body));
  }

  @Post('admin/role') async role(@Employee() me: Person, @Body() body: unknown) {
    return this.service.role(me, parse(roleBody, body));
  }

  @Post('admin/supervisor') async supervisor(@Employee() me: Person, @Body() body: unknown) {
    return this.service.supervisor(me, parse(supervisorBody, body));
  }
}
