import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AuthModule } from './features/auth/auth.module';
import { MeetingsModule } from './features/meetings/meetings.module';
import { StationsModule } from './features/stations/stations.module';
import { WorkspaceModule } from './features/workspace/workspace.module';

@Module({
  imports: [CommonModule, AuthModule, WorkspaceModule, StationsModule, MeetingsModule],
})
export class AppModule {}
