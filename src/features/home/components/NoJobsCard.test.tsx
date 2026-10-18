/** NoJobsCard — the hint depends on whether a technician exists to assign to. */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { NoJobsCard } from './NoJobsCard';

function texts(hasTechnicians: boolean) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<NoJobsCard hasTechnicians={hasTechnicians} />);
  });
  return r.root.findAllByType(Text).map((t) => String(t.props.children));
}

describe('NoJobsCard', () => {
  it('with technicians, invites the owner to create a job', () => {
    const t = texts(true);
    expect(t).toContain('No jobs yet');
    expect(t).toContain('Create your first job to assign it to a technician.');
  });

  it('without technicians, says to add one first', () => {
    const t = texts(false);
    expect(t).toContain('Add a technician first, then you can create and assign jobs.');
    expect(t).not.toContain('Create your first job to assign it to a technician.');
  });
});
