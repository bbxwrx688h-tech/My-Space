import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Person } from '../../../shared/model';
import {
  attendeeQuery,
  exchangeCreateBody,
  invitationDecisionBody,
  requestCancelBody,
  requestDecisionBody,
  seriesCancelBody,
} from '../../../shared/contracts/meeting';
import { Employee, SessionGuard } from '../../auth/session';
import { parse } from '../../common/validation/parse';
import { MeetingActionService } from './meeting-action.service';
import { MeetingRepository } from './meeting.repository';

@Controller('meetings')
@UseGuards(SessionGuard)
export class MeetingActionsController {
  constructor(
    private readonly repository: MeetingRepository,
    private readonly actions: MeetingActionService,
  ) {}

  @Get('requests') async requests(@Employee() me: Person) {
    return this.repository.listRequests(me);
  }

  @Post('requests/decision') async decide(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(requestDecisionBody, body);
    return this.actions.decideRequest(me, input);
  }

  @Post('requests/cancel') async cancelRequest(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(requestCancelBody, body);
    return this.actions.cancelRequest(me, input);
  }

  @Get('invitations') async invitations(@Employee() me: Person) {
    return this.repository.listInvitations(me);
  }

  @Get('attendees') async attendees(@Employee() me: Person, @Query() query: unknown) {
    const input = parse(attendeeQuery, query);
    const meeting = await this.repository.findAttendeeContext(input.meeting, me.id);
    if (!meeting) throw new NotFoundException('הפגישה לא נמצאה');
    if (
      meeting.private &&
      meeting.organizer_id !== me.id &&
      !(
        me.role === 'boss' &&
        meeting.owner_role === 'manager' &&
        meeting.supervisor_id === me.id
      ) &&
      me.role !== 'admin' &&
      !meeting.invited
    )
      throw new ForbiddenException('אין הרשאה לצפות במוזמנים');
    return this.repository.listAttendees(input.meeting);
  }

  @Get('upcoming') async upcoming(@Employee() me: Person) {
    if (me.role === 'user') throw new ForbiddenException('אין הרשאה לבקש החלפת פגישות');
    return this.repository.listUpcoming(me);
  }

  @Post('invitations/decision') async decideInvitation(
    @Employee() me: Person,
    @Body() body: unknown,
  ) {
    const input = parse(invitationDecisionBody, body);
    return this.actions.decideInvitation(me, input);
  }

  @Post('series/cancel') async cancelSeries(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(seriesCancelBody, body);
    return this.actions.cancelSeries(me, input);
  }

  @Post('exchange') async createExchangeRequest(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(exchangeCreateBody, body);
    return this.actions.createExchange(me, input);
  }

  @Get('exchange') async exchanges(@Employee() me: Person) {
    return this.repository.listExchanges(me);
  }

  @Post('exchange/decision') async exchangeDecision(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(requestDecisionBody, body);
    return this.actions.decideExchange(me, input);
  }
}
