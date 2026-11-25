import { Box, Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { ExchangeRequest, Invitation, MeetingRequest, Workspace } from '../../../shared/model';
import { endpoints } from '../endpoints';
import { clock, endClock, fullDate } from '../dates';
import { buttonSx, panelSx, rowSx, stackSx } from '../layout';
import { ErrorLine, useAction } from '../components/Fields';

export function Requests({ data, saved }: { data: Workspace; saved: () => Promise<void> }) {
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const action = useAction();
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const targetType = params.get('target');
  const targetId = Number(params.get('id'));
  const target =
    ['request', 'exchange', 'invitation'].includes(targetType || '') &&
    Number.isSafeInteger(targetId) &&
    targetId > 0
      ? `${targetType}-${targetId}`
      : null;
  const targetExists =
    targetType === 'request'
      ? requests.some((item) => item.id === targetId)
      : targetType === 'exchange'
        ? exchanges.some((item) => item.id === targetId)
        : invitations.some((item) => item.id === targetId);
  useEffect(() => {
    if (!loading && target && targetExists)
      document.getElementById(target)?.scrollIntoView({ block: 'center' });
  }, [loading, target, targetExists]);

  // App refreshes workspace data after changes and periodically while visible.
  useEffect(() => {
    let current = true;
    Promise.all([
      endpoints.meetings.requests(),
      endpoints.meetings.exchanges(),
      endpoints.meetings.invitations(),
    ])
      .then(([booking, exchange, invites]) => {
        if (!current) return;
        setRequests(booking);
        setExchanges(exchange);
        setInvitations(invites);
        setError('');
      })
      .catch((reason: Error) => {
        if (current) setError(reason.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [data, revision]);

  function decide(request: () => Promise<unknown>) {
    void action.run(async () => {
      await request();
      await saved();
    });
  }
  function time(start: string, end: string) {
    return (
      <>
        {fullDate(start)} ·{' '}
        <bdi>
          {clock(start)}–{endClock(start, end)}
        </bdi>
      </>
    );
  }
  const roomName = (id: number | null) => data.rooms.find((room) => room.id === id)?.name || '';
  return (
    <Box sx={stackSx}>
      <Box sx={{ ...rowSx, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Typography variant="h1">בקשות והזמנות</Typography>
        <Button
          sx={buttonSx}
          variant="outlined"
          disabled={action.busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          רענון
        </Button>
      </Box>
      <ErrorLine error={error || action.error} />
      {loading && <Typography>טוען בקשות…</Typography>}
      {!loading && !error && !requests.length && !exchanges.length && !invitations.length && (
        <Typography sx={panelSx}>אין בקשות או הזמנות ממתינות.</Typography>
      )}
      {!loading && !error && target && !targetExists && (
        <Typography sx={panelSx}>הפריט אינו זמין עוד או שאין לך גישה אליו.</Typography>
      )}
      {invitations.map((invitation) => (
        <Box
          component="section"
          id={`invitation-${invitation.id}`}
          sx={{
            ...panelSx,
            outline: target === `invitation-${invitation.id}` ? '2px solid' : undefined,
            outlineColor: 'primary.main',
          }}
          key={'invite' + invitation.id}
        >
          <Typography variant="h3">הזמנה לפגישה · {invitation.title}</Typography>
          <Typography sx={{ my: 1 }}>
            {invitation.organizer} · {roomName(invitation.roomId)} ·{' '}
            {time(invitation.start, invitation.end)}
          </Typography>
          {invitation.visit && <Typography>פגישת ביקור</Typography>}
          <Box sx={rowSx}>
            <Button
              sx={buttonSx}
              variant="contained"
              disabled={action.busy}
              onClick={() =>
                decide(() =>
                  endpoints.meetings.invitationDecision({ meetingId: invitation.id, accept: true }),
                )
              }
            >
              אישור הגעה
            </Button>
            <Button
              sx={buttonSx}
              disabled={action.busy}
              onClick={() =>
                decide(() =>
                  endpoints.meetings.invitationDecision({
                    meetingId: invitation.id,
                    accept: false,
                  }),
                )
              }
            >
              דחייה
            </Button>
          </Box>
        </Box>
      ))}
      {requests.map((request) => {
        const canDecide = data.me.role === 'admin' || request.myApproval === false;
        return (
          <Box
            component="section"
            id={`request-${request.id}`}
            sx={{
              ...panelSx,
              outline: target === `request-${request.id}` ? '2px solid' : undefined,
              outlineColor: 'primary.main',
            }}
            key={'request' + request.id}
          >
            <Typography variant="h3">
              {request.kind === 'takeover'
                ? 'בקשה להזמנה על חשבון פגישה'
                : request.kind === 'series_edit'
                  ? 'בקשה לשינוי סדרת פגישות'
                  : request.kind === 'edit' || request.kind === 'boss_edit'
                    ? 'בקשה לשינוי פגישה'
                    : 'בקשה להזמנת חדר'}{' '}
              · {request.title}
            </Typography>
            <Typography sx={{ my: 1 }}>
              מבקש/ת {request.requester} · הבקשה תקפה עד {fullDate(request.expires)}{' '}
              {clock(request.expires)}
            </Typography>
            {request.description && (
              <Typography sx={{ whiteSpace: 'pre-line', mb: 1 }}>{request.description}</Typography>
            )}
            {request.visit && <Typography>פגישה במסגרת ביקור</Typography>}
            {!!request.invitees.length && (
              <Typography>
                מוזמנים לאחר האישור ·{' '}
                {request.invitees.map((person) => `${person.name} ${person.surname}`).join(', ')}
              </Typography>
            )}
            {request.slots.map((slot, index) => (
              <Typography key={index}>
                {roomName(slot.roomId)} · {time(slot.start, slot.end)}
              </Typography>
            ))}
            {request.targets.map((target) => (
              <Typography color="text.secondary" key={target.meetingId}>
                מועד קיים · {target.title} · {roomName(target.roomId)} ·{' '}
                {time(target.start, target.end)}
              </Typography>
            ))}
            {request.conflicts.map((conflict) => (
              <Typography color="text.secondary" key={conflict.meetingId}>
                פגישה מושפעת: {conflict.title} · {conflict.organizer} ·{' '}
                {time(conflict.start, conflict.end)}
              </Typography>
            ))}
            {canDecide && (
              <Box sx={{ ...rowSx, mt: 2 }}>
                <Button
                  sx={buttonSx}
                  variant="contained"
                  disabled={action.busy}
                  onClick={() =>
                    decide(() =>
                      endpoints.meetings.requestDecision({ requestId: request.id, approve: true }),
                    )
                  }
                >
                  אישור
                </Button>
                <Button
                  sx={buttonSx}
                  disabled={action.busy}
                  onClick={() =>
                    decide(() =>
                      endpoints.meetings.requestDecision({ requestId: request.id, approve: false }),
                    )
                  }
                >
                  דחייה
                </Button>
              </Box>
            )}
            {!canDecide && (
              <Typography sx={{ mt: 1 }} color="text.secondary">
                {request.myApproval ? 'אישרת · ממתין לאישורים נוספים' : 'ממתין לאישור'}
              </Typography>
            )}
            {request.requesterId === data.me.id && (
              <Button
                sx={buttonSx}
                disabled={action.busy}
                onClick={() =>
                  decide(() => endpoints.meetings.requestCancel({ requestId: request.id }))
                }
              >
                ביטול הבקשה
              </Button>
            )}
          </Box>
        );
      })}
      {exchanges.map((request) => {
        const canDecide = data.me.role === 'admin' || request.myApproval === false;
        return (
          <Box
            component="section"
            id={`exchange-${request.id}`}
            sx={{
              ...panelSx,
              outline: target === `exchange-${request.id}` ? '2px solid' : undefined,
              outlineColor: 'primary.main',
            }}
            key={'exchange' + request.id}
          >
            <Typography variant="h3">
              {request.kind === 'release' ? 'בקשה לשחרור חדר' : 'בקשה להחלפת פגישות'}
            </Typography>
            <Typography sx={{ my: 1 }}>
              מבקש/ת {request.requester} · {request.title} · {roomName(request.roomId)} ·{' '}
              {time(request.start, request.end)}
            </Typography>
            {request.otherStart && request.otherEnd && (
              <Typography>
                {request.otherTitle} · {roomName(request.otherRoomId)} ·{' '}
                {time(request.otherStart, request.otherEnd)}
              </Typography>
            )}
            <Typography color="text.secondary">
              בתוקף עד {fullDate(request.expires)} {clock(request.expires)}
            </Typography>
            {canDecide && (
              <Box sx={{ ...rowSx, mt: 2 }}>
                <Button
                  sx={buttonSx}
                  variant="contained"
                  disabled={action.busy}
                  onClick={() =>
                    decide(() =>
                      endpoints.meetings.exchangeDecision({ requestId: request.id, approve: true }),
                    )
                  }
                >
                  אישור
                </Button>
                <Button
                  sx={buttonSx}
                  disabled={action.busy}
                  onClick={() =>
                    decide(() =>
                      endpoints.meetings.exchangeDecision({
                        requestId: request.id,
                        approve: false,
                      }),
                    )
                  }
                >
                  דחייה
                </Button>
              </Box>
            )}
            {!canDecide && <Typography color="text.secondary">ממתין לאישור</Typography>}
          </Box>
        );
      })}
    </Box>
  );
}
