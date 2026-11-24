import { ErrorLine, Modal } from '@app/components/Fields';
import { useMeetingDialog, UseMeetingDialogProps } from './useMeetingDialog';
import { MeetingReview } from './MeetingReview';
import { MeetingForm } from './MeetingForm';
import { MeetingDetails } from './MeetingDetails';

export function MeetingDialog(props: UseMeetingDialogProps) {
  const view = useMeetingDialog(props);
  return (
    <Modal title={view.modalTitle} close={props.close}>
      <ErrorLine error={view.error} />
      {view.review ? (
        <MeetingReview {...view.review} />
      ) : view.editing ? (
        <MeetingForm {...view.form} />
      ) : (
        view.details && <MeetingDetails {...view.details} />
      )}
    </Modal>
  );
}
