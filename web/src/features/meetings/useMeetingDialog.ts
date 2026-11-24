import { useEffect, useState } from 'react';
import { Attendee, DirectoryPerson, Meeting, Review, Workspace } from '@shared/model';
import { ApiError } from '@app/api';
import { endpoints } from '@app/endpoints';
import { clock, local, now, nextMeetingSlot } from '@app/dates';
import { useAction } from '@app/components/Fields';
import { useHashRoute } from '@app/app/useHashRoute';
import { slots } from './MeetingTimeField';
import type { MeetingDetailsProps } from './MeetingDetails';
import type { MeetingFormProps } from './MeetingForm';
import type { MeetingReviewProps } from './MeetingReview';

type Change = Record<string, unknown>;

export interface UseMeetingDialogProps {
  data: Workspace;
  roomId: number;
  meeting?: Meeting;
  initialDate?: string;
  close: () => void;
  saved: (date?: string, selectedRoomId?: number) => Promise<void>;
}

export interface MeetingDialogView {
  modalTitle: string;
  error: string;
  editing: boolean;
  review: MeetingReviewProps | null;
  form: MeetingFormProps;
  details: MeetingDetailsProps | null;
}

export function useMeetingDialog({
  data,
  roomId,
  meeting,
  initialDate,
  close,
  saved,
}: UseMeetingDialogProps): MeetingDialogView {
  const [initial] = useState(() => nextMeetingSlot(initialDate));
  const [editing, setEditing] = useState(!meeting);
  const [date, setDate] = useState(meeting ? local(meeting.start).toISODate()! : initial.date);
  const [selectedRoomId, setSelectedRoomId] = useState(roomId);
  const [from, setFrom] = useState(meeting ? clock(meeting.start) : initial.from);
  const [until, setUntil] = useState(
    meeting
      ? local(meeting.end).toISODate() !== date
        ? '24:00'
        : clock(meeting.end)
      : initial.until,
  );
  const [title, setTitle] = useState(meeting?.title || '');
  const [description, setDescription] = useState(meeting?.description || '');
  const [isPrivate, setPrivate] = useState(!!meeting?.private);
  const [visit, setVisit] = useState(!!meeting?.visit);
  const [invitees, setInvitees] = useState<DirectoryPerson[]>([]);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [attendeesLoaded, setAttendeesLoaded] = useState(!meeting || !!meeting.pending);
  const [attendeesLoadFailed, setAttendeesLoadFailed] = useState(false);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');
  const [editScope, setEditScope] = useState<'single' | 'following'>('single');
  const [recurrenceEnd, setRecurrenceEnd] = useState<'count' | 'date'>('count');
  const [count, setCount] = useState(4);
  const [endDate, setEndDate] = useState(date);
  const [swapOptions, setSwapOptions] = useState<Meeting[] | null>(null);
  const [swapId, setSwapId] = useState('');
  const [pending, setPending] = useState<{ review: Review; change: Change; ready: number } | null>(
    null,
  );
  const [seconds, setSeconds] = useState(0);
  const action = useAction();
  const { navigate } = useHashRoute();
  const room = data.rooms.find((r) => r.id === roomId)!;
  const changeable =
    meeting &&
    !meeting.pending &&
    local(meeting.end) > now() &&
    (data.me.id === meeting.organizerId ||
      data.me.role === 'admin' ||
      (data.me.role === 'boss' &&
        meeting.role === 'manager' &&
        meeting.ownerSupervisorId === data.me.id));
  const canEdit = changeable && data.me.role !== 'user';
  useEffect(() => {
    if (!meeting || meeting.pending) return;
    let current = true;
    endpoints.meetings
      .attendees(meeting.id)
      .then((list) => {
        if (current) {
          setAttendees(list);
          setInvitees(list);
        }
      })
      .catch((error: Error) => {
        if (current && !(error instanceof ApiError && error.status === 403)) {
          setAttendeesLoadFailed(true);
        }
      })
      .finally(() => {
        if (current) setAttendeesLoaded(true);
      });
    return () => {
      current = false;
    };
  }, [meeting?.id]);
  useEffect(() => {
    if (!pending) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((pending.ready - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [pending]);
  async function submit(change: Change, token?: string) {
    await action.run(async () => {
      try {
        const result = await endpoints.meetings.change(change, token);
        if (result.pending) {
          await saved(
            typeof change.date === 'string' ? change.date : undefined,
            typeof change.roomId === 'number' ? change.roomId : undefined,
          );
          close();
          navigate('requests');
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && e.review) {
          setSeconds(e.review.waitSeconds);
          setPending({ change, review: e.review, ready: Date.now() + e.review.waitSeconds * 1000 });
          return;
        }
        throw e;
      }
      await saved(
        typeof change.date === 'string' ? change.date : undefined,
        typeof change.roomId === 'number' ? change.roomId : undefined,
      );
      close();
    });
  }
  const target = meeting ? { meetingId: meeting.id, version: meeting.version } : {};
  const modalTitle = pending
    ? 'אישור שינוי בפגישות'
    : editing
      ? meeting
        ? 'עריכת פגישה'
        : data.me.role === 'manager'
          ? 'בקשה להזמנת חדר'
          : 'פגישה חדשה'
      : 'פרטי הפגישה';

  function changeDate(day: string) {
    setDate(day);
    if (endDate < day) setEndDate(day);
    if (day === now().toISODate() && from <= now().toFormat('HH:mm')) {
      const next = nextMeetingSlot(day);
      setDate(next.date);
      setEndDate((previous) => (previous < next.date ? next.date : previous));
      setFrom(next.from);
      setUntil(next.until);
    }
  }
  function changeFrom(value: string) {
    setFrom(value);
    if (until <= value) setUntil(slots[slots.indexOf(value) + 1] || '24:00');
  }

  const review: MeetingReviewProps | null = pending
    ? {
        review: pending.review,
        seconds,
        busy: action.busy,
        onConfirm: () => void submit(pending.change, pending.review.token),
        onBack: () => setPending(null),
      }
    : null;

  const current = now();
  const form: MeetingFormProps = {
    data,
    meeting,
    busy: action.busy,
    fields: {
      date,
      roomId: selectedRoomId,
      setRoomId: setSelectedRoomId,
      from,
      until,
      setUntil,
      title,
      setTitle,
      description,
      setDescription,
      isPrivate,
      setPrivate,
      visit,
      setVisit,
      invitees,
      setInvitees,
      attendeesLoaded,
      attendeesLoadFailed,
      recurrence,
      setRecurrence,
      editScope,
      setEditScope,
      recurrenceEnd,
      setRecurrenceEnd,
      count,
      setCount,
      endDate,
      setEndDate,
      dateMin: current.toISODate()!,
      dateMax: data.me.role === 'manager' ? current.plus({ weeks: 2 }).toISODate()! : undefined,
      startMin: date === current.toISODate() ? current.toFormat('HH:mm') : undefined,
      onDateChange: changeDate,
      onStartChange: changeFrom,
    },
    onSubmit: () => {
      void submit({
        action: meeting ? 'edit' : 'create',
        roomId: selectedRoomId,
        ...target,
        date,
        from,
        until,
        title,
        description,
        private: isPrivate,
        visit,
        invitees: invitees.map((person) => person.id),
        ...(meeting ? { scope: editScope } : {}),
        ...(!meeting && recurrence !== 'none'
          ? {
              recurrence: {
                frequency: recurrence,
                ...(recurrenceEnd === 'count' ? { count } : { endDate }),
              },
            }
          : {}),
      });
    },
  };

  const details: MeetingDetailsProps | null = meeting
    ? {
        meeting,
        room,
        attendees,
        changeable: !!changeable,
        canEdit: !!canEdit,
        busy: action.busy,
        canExchange: !meeting.pending && data.me.role !== 'user' && local(meeting.start) > now(),
        canRelease: meeting.organizerId !== data.me.id,
        canSwap: data.me.role === 'admin' || meeting.role !== 'user',
        swapOptions,
        swapId,
        onSwapIdChange: setSwapId,
        onEdit: () => setEditing(true),
        onCancel: () => {
          if (meeting.organizerId !== data.me.id || window.confirm('לבטל את הפגישה?'))
            void submit({ action: 'cancel', roomId, ...target });
        },
        onCancelFollowing: () => {
          const seriesId = meeting.seriesId;
          if (!seriesId) return;
          if (!window.confirm('לבטל את הפגישה הזו ואת הפגישות הבאות בסדרה?')) return;
          void action.run(async () => {
            await endpoints.meetings.cancelSeries({ seriesId, fromMeetingId: meeting.id });
            await saved();
            close();
          });
        },
        onCancelSeries: () => {
          const seriesId = meeting.seriesId;
          if (!seriesId) return;
          if (!window.confirm('לבטל את כל הפגישות בסדרה?')) return;
          void action.run(async () => {
            await endpoints.meetings.cancelSeries({ seriesId });
            await saved();
            close();
          });
        },
        onRelease: () => {
          void action.run(async () => {
            await endpoints.meetings.exchange({ kind: 'release', meetingId: meeting.id });
            await saved();
            close();
            navigate('requests');
          });
        },
        onRequestSwap: () => {
          void action.run(async () => {
            const upcoming = await endpoints.meetings.upcoming();
            setSwapOptions(
              upcoming.filter(
                (candidate) =>
                  candidate.id !== meeting.id &&
                  (data.me.role === 'admin' || candidate.role !== 'user'),
              ),
            );
          });
        },
        onSubmitSwap: () => {
          void action.run(async () => {
            await endpoints.meetings.exchange({
              kind: 'swap',
              meetingId: meeting.id,
              otherMeetingId: Number(swapId),
            });
            await saved();
            close();
            navigate('requests');
          });
        },
      }
    : null;

  return { modalTitle, error: action.error, editing, review, form, details };
}
