import { Module } from '@nestjs/common';
import { ExpiryService } from './expiry.service';
import { MeetingActionService } from './meeting-action.service';
import { MeetingActionsController } from './meeting-actions.controller';
import { MeetingChangeService } from './meeting-change.service';
import { MeetingRepository } from './meeting.repository';
import { MeetingsController } from './meetings.controller';

@Module({
  controllers: [MeetingsController, MeetingActionsController],
  providers: [ExpiryService, MeetingActionService, MeetingChangeService, MeetingRepository],
})
export class MeetingsModule {}
