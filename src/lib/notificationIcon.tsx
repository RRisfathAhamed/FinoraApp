import { Bell, Briefcase, CreditCard, MessageSquare, PiggyBank, Receipt, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import type { NotificationItem } from './select';

export function iconFor(kind: NotificationItem['kind']): ReactNode {
  switch (kind) {
    case 'salary':
      return <Briefcase size={17} />;
    case 'emi':
      return <CreditCard size={17} />;
    case 'bill':
      return <Receipt size={17} />;
    case 'budget':
      return <Target size={17} />;
    case 'savings':
      return <PiggyBank size={17} />;
    case 'sms':
      return <MessageSquare size={17} />;
    default:
      return <Bell size={17} />;
  }
}
