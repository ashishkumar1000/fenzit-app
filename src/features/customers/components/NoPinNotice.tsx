/**
 * NoPinNotice — a red chip saying the customer has no map pin. Shown on the
 * customer card and the detail screen so the owner sees, before a job is
 * raised, that the employee will only have the typed address.
 */
import { TriangleAlert } from 'lucide-react-native';
import { Badge } from '../../../components/ui';
import { colors } from '../../../theme';
import { NO_PIN_NOTICE } from '../locationStatus';

export function NoPinNotice() {
  return (
    <Badge
      status="cancelled"
      tone="soft"
      icon={<TriangleAlert size={12} color={colors.status.cancelled.fg} strokeWidth={2} />}>
      {NO_PIN_NOTICE}
    </Badge>
  );
}
