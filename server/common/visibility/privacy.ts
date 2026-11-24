import { Meeting } from '../../../shared/model';

/** Replace private details while keeping the occupied time visible to others. */
export function concealPrivateMeeting(meeting: Meeting): Meeting {
  return { ...meeting, title: 'פגישה פרטית', description: '', visit: false, private: true };
}
